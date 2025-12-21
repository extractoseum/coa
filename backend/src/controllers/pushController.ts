import { Request, Response } from 'express';
import { supabase } from '../config/supabase';
import * as onesignal from '../services/onesignalService';
import {
    getCachedTags,
    refreshTagsCache,
    getCacheAge,
    getRefreshProgress,
    syncAllCustomersToBackup,
    getBackupStats,
    searchCustomersInBackup,
    getCustomersByTagFromBackup
} from '../services/shopifyService';
import {
    sendBulkWhatsApp,
    isWhapiConfigured,
    checkWhapiStatus
} from '../services/whapiService';

/**
 * Register a device for push notifications
 * POST /api/v1/push/register
 */
export const registerDevice = async (req: Request, res: Response) => {
    try {
        const clientId = (req as any).client?.id;
        const { playerId, platform, deviceInfo } = req.body;

        if (!clientId) {
            return res.status(401).json({ success: false, error: 'No autenticado' });
        }

        if (!playerId) {
            return res.status(400).json({ success: false, error: 'Player ID requerido' });
        }

        const success = await onesignal.registerDevice(
            clientId,
            playerId,
            platform || 'web',
            deviceInfo
        );

        if (!success) {
            return res.status(500).json({ success: false, error: 'Error registrando dispositivo' });
        }

        // Also set tags in OneSignal for targeting
        const { data: client } = await supabase
            .from('clients')
            .select('tags, membership_tier')
            .eq('id', clientId)
            .single();

        res.json({
            success: true,
            message: 'Dispositivo registrado para notificaciones'
        });

    } catch (error: any) {
        console.error('[Push] Register error:', error);
        res.status(500).json({ success: false, error: 'Error del servidor' });
    }
};

/**
 * Unregister a device (on logout)
 * POST /api/v1/push/unregister
 */
export const unregisterDevice = async (req: Request, res: Response) => {
    try {
        const { playerId } = req.body;

        if (!playerId) {
            return res.status(400).json({ success: false, error: 'Player ID requerido' });
        }

        await onesignal.unregisterDevice(playerId);

        res.json({ success: true });

    } catch (error: any) {
        console.error('[Push] Unregister error:', error);
        res.status(500).json({ success: false, error: 'Error del servidor' });
    }
};

/**
 * Send a push notification (super_admin only)
 * Supports multiple channels: push (OneSignal) and whatsapp (Whapi.cloud)
 * POST /api/v1/push/send
 */
export const sendNotification = async (req: Request, res: Response) => {
    try {
        const clientId = (req as any).client?.id;
        const { title, message, targetType, targetValue, imageUrl, data, scheduledFor, channels, individualCustomer } = req.body;

        // Default to push only if no channels specified
        const selectedChannels: string[] = channels || ['push'];

        if (!title || !message) {
            return res.status(400).json({ success: false, error: 'Titulo y mensaje requeridos' });
        }

        if (!targetType) {
            return res.status(400).json({ success: false, error: 'Tipo de audiencia requerido' });
        }

        if (selectedChannels.length === 0) {
            return res.status(400).json({ success: false, error: 'Selecciona al menos un canal' });
        }

        let pushResult: any = null;
        let whatsappQueued = false;
        let notificationId: string | null = null;

        // Send via Push (OneSignal) if selected
        // Skip push for individual targeting (we don't have client_id from Shopify customer)
        const shouldSendPush = selectedChannels.includes('push') && targetType !== 'individual';

        if (shouldSendPush) {
            pushResult = await onesignal.sendNotification({
                title,
                message,
                targetType,
                targetValue,
                imageUrl,
                data,
                scheduledFor: scheduledFor ? new Date(scheduledFor) : undefined,
                sentBy: clientId,
                channels: selectedChannels
            });

            if (!pushResult.success && !selectedChannels.includes('whatsapp')) {
                return res.status(500).json({ success: false, error: pushResult.error });
            }

            notificationId = pushResult.notificationId;
        }

        // Send via WhatsApp (Whapi.cloud) if selected
        if (selectedChannels.includes('whatsapp') && isWhapiConfigured()) {
            // Get phones based on targetType
            let phones: string[] = [];

            if (targetType === 'all') {
                // Get all phones from backup
                const { data: customers } = await supabase
                    .from('shopify_customers_backup')
                    .select('phone')
                    .not('phone', 'is', null)
                    .neq('phone', '');
                phones = (customers || []).map(c => c.phone).filter(Boolean);
            } else if (targetType === 'tag' && targetValue) {
                // Get phones by tag
                const customers = await getCustomersByTagFromBackup(targetValue, 5000);
                phones = customers.filter(c => c.phone).map(c => c.phone!);
            } else if (targetType === 'individual') {
                // Get phone from individual customer data
                if (individualCustomer?.phone) {
                    phones = [individualCustomer.phone];
                    console.log(`[Push] Individual WhatsApp to: ${individualCustomer.phone}`);
                } else if (targetValue) {
                    // Fallback: targetValue might contain the phone
                    phones = [targetValue];
                }
            }

            if (phones.length > 0) {
                // If we don't have a notification ID from push, create one for tracking
                if (!notificationId) {
                    console.log('[Push] Creating notification record for WhatsApp tracking...');
                    const { data: notification, error: notifError } = await supabase
                        .from('push_notifications')
                        .insert({
                            title,
                            message,
                            target_type: targetType,
                            target_value: targetValue,
                            sent_by: clientId,
                            status: 'sent',
                            sent_at: new Date().toISOString()
                        })
                        .select('id')
                        .single();

                    if (notifError) {
                        console.error('[Push] Error creating notification record:', notifError);
                    } else {
                        console.log('[Push] Notification record created:', notification?.id);
                    }
                    notificationId = notification?.id;
                }

                // Build WhatsApp message (include title as bold)
                const whatsappBody = `*${title}*\n\n${message}`;

                console.log(`[Push] Queueing WhatsApp to ${phones.length} recipients...`);
                console.log(`[Push] Phones to send: ${JSON.stringify(phones)}`);
                console.log(`[Push] NotificationId for WhatsApp: ${notificationId}`);

                // Send in background to not block response
                if (notificationId) {
                    console.log(`[Push] Calling sendBulkWhatsApp NOW...`);
                    sendBulkWhatsApp(phones, whatsappBody, notificationId)
                        .then(result => {
                            console.log(`[Push] WhatsApp complete: ${result.sent} sent, ${result.failed} failed`);
                        })
                        .catch(err => {
                            console.error('[Push] WhatsApp error:', err);
                            console.error('[Push] WhatsApp error stack:', err?.stack);
                        });
                    console.log(`[Push] sendBulkWhatsApp called (async)`);
                } else {
                    console.error('[Push] No notificationId, cannot send WhatsApp');
                }

                whatsappQueued = true;
            } else {
                console.log('[Push] No phones found for WhatsApp targeting');
            }
        }

        // Check if at least one channel succeeded
        const pushSucceeded = pushResult?.success === true;
        const whatsappSucceeded = whatsappQueued === true;

        // If neither channel succeeded, return error
        if (!pushSucceeded && !whatsappSucceeded) {
            // Determine the error message
            let errorMsg = 'No se pudo enviar la notificacion';
            if (selectedChannels.includes('push') && targetType === 'individual') {
                errorMsg = 'Push no disponible para usuario individual. Selecciona WhatsApp.';
            } else if (selectedChannels.includes('whatsapp') && !whatsappQueued) {
                errorMsg = 'No se encontró teléfono para este usuario';
            } else if (pushResult?.error) {
                errorMsg = pushResult.error;
            }
            return res.status(400).json({ success: false, error: errorMsg });
        }

        // Build response
        const response: any = {
            success: true,
            channels: selectedChannels,
            message: scheduledFor ? 'Notificacion programada' : 'Notificacion enviada'
        };

        if (pushResult) {
            response.push = {
                success: pushResult.success,
                notificationId: pushResult.notificationId,
                recipients: pushResult.recipients
            };
        }

        if (selectedChannels.includes('whatsapp')) {
            response.whatsapp = {
                queued: whatsappQueued,
                message: whatsappQueued
                    ? 'Mensajes de WhatsApp en cola de envío'
                    : 'No se encontraron teléfonos para enviar'
            };
        }

        res.json(response);

    } catch (error: any) {
        console.error('[Push] Send error:', error);
        res.status(500).json({ success: false, error: 'Error del servidor' });
    }
};

/**
 * Get notification history (super_admin only)
 * GET /api/v1/push/history
 */
export const getNotificationHistory = async (req: Request, res: Response) => {
    try {
        const limit = parseInt(req.query.limit as string) || 50;
        const offset = parseInt(req.query.offset as string) || 0;

        const { notifications, total } = await onesignal.getNotificationHistory(limit, offset);

        res.json({
            success: true,
            notifications,
            total,
            limit,
            offset
        });

    } catch (error: any) {
        console.error('[Push] History error:', error);
        res.status(500).json({ success: false, error: 'Error del servidor' });
    }
};

/**
 * Cancel a scheduled notification (super_admin only)
 * DELETE /api/v1/push/cancel/:notificationId
 */
export const cancelNotification = async (req: Request, res: Response) => {
    try {
        const { notificationId } = req.params;

        const result = await onesignal.cancelScheduledNotification(notificationId);

        if (!result.success) {
            return res.status(400).json({ success: false, error: result.error });
        }

        res.json({ success: true, message: 'Notificacion cancelada' });

    } catch (error: any) {
        console.error('[Push] Cancel error:', error);
        res.status(500).json({ success: false, error: 'Error del servidor' });
    }
};

/**
 * Get/Update user notification preferences
 * GET/PUT /api/v1/push/preferences
 */
export const getPreferences = async (req: Request, res: Response) => {
    try {
        const clientId = (req as any).client?.id;

        if (!clientId) {
            return res.status(401).json({ success: false, error: 'No autenticado' });
        }

        // Get or create preferences
        let { data: prefs } = await supabase
            .from('notification_preferences')
            .select('*')
            .eq('client_id', clientId)
            .single();

        if (!prefs) {
            // Create default preferences
            const { data: newPrefs } = await supabase
                .from('notification_preferences')
                .insert({ client_id: clientId })
                .select()
                .single();
            prefs = newPrefs;
        }

        res.json({ success: true, preferences: prefs });

    } catch (error: any) {
        console.error('[Push] Get preferences error:', error);
        res.status(500).json({ success: false, error: 'Error del servidor' });
    }
};

export const updatePreferences = async (req: Request, res: Response) => {
    try {
        const clientId = (req as any).client?.id;
        const updates = req.body;

        if (!clientId) {
            return res.status(401).json({ success: false, error: 'No autenticado' });
        }

        // Only allow specific fields
        const allowedFields = [
            'notify_new_coa',
            'notify_review_received',
            'notify_review_approved',
            'notify_promotions',
            'notify_announcements'
        ];

        const safeUpdates: any = { updated_at: new Date().toISOString() };
        for (const field of allowedFields) {
            if (updates[field] !== undefined) {
                safeUpdates[field] = updates[field];
            }
        }

        // Upsert preferences
        const { data, error } = await supabase
            .from('notification_preferences')
            .upsert({
                client_id: clientId,
                ...safeUpdates
            }, {
                onConflict: 'client_id'
            })
            .select()
            .single();

        if (error) throw error;

        res.json({ success: true, preferences: data });

    } catch (error: any) {
        console.error('[Push] Update preferences error:', error);
        res.status(500).json({ success: false, error: 'Error del servidor' });
    }
};

/**
 * Get push notification stats (super_admin only)
 * GET /api/v1/push/stats
 */
export const getStats = async (req: Request, res: Response) => {
    try {
        // Total registered devices
        const { count: totalDevices } = await supabase
            .from('push_tokens')
            .select('*', { count: 'exact', head: true })
            .eq('is_active', true);

        // Notifications sent in last 30 days
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const { count: notificationsSent } = await supabase
            .from('push_notifications')
            .select('*', { count: 'exact', head: true })
            .eq('status', 'sent')
            .gte('sent_at', thirtyDaysAgo.toISOString());

        // Get total opens/delivered
        const { data: statsData } = await supabase
            .from('push_notifications')
            .select('sent_count, delivered_count, opened_count')
            .eq('status', 'sent')
            .gte('sent_at', thirtyDaysAgo.toISOString());

        const totals = (statsData || []).reduce((acc, n) => ({
            sent: acc.sent + (n.sent_count || 0),
            delivered: acc.delivered + (n.delivered_count || 0),
            opened: acc.opened + (n.opened_count || 0)
        }), { sent: 0, delivered: 0, opened: 0 });

        res.json({
            success: true,
            stats: {
                totalDevices: totalDevices || 0,
                notificationsSent30Days: notificationsSent || 0,
                totalRecipients: totals.sent,
                totalDelivered: totals.delivered,
                totalOpened: totals.opened,
                openRate: totals.delivered > 0
                    ? ((totals.opened / totals.delivered) * 100).toFixed(1) + '%'
                    : '0%'
            }
        });

    } catch (error: any) {
        console.error('[Push] Stats error:', error);
        res.status(500).json({ success: false, error: 'Error del servidor' });
    }
};

/**
 * Get all Shopify customer tags with count (super_admin only)
 * Uses cache for fast response, falls back to Shopify if cache empty
 * GET /api/v1/push/tags
 */
export const getShopifyTags = async (_req: Request, res: Response) => {
    try {
        // First try cache (fast)
        let tags = await getCachedTags();
        const cacheAge = await getCacheAge();

        // If cache is empty, refresh from Shopify (first time)
        if (tags.length === 0) {
            console.log('[Push] Cache empty, fetching from Shopify...');
            tags = await refreshTagsCache();
        }

        res.json({
            success: true,
            tags,
            cacheAgeMinutes: cacheAge
        });
    } catch (error: any) {
        console.error('[Push] Error getting Shopify tags:', error);
        res.status(500).json({ success: false, error: error.message || 'Error del servidor', tags: [] });
    }
};

/**
 * Force refresh Shopify tags cache (super_admin only)
 * POST /api/v1/push/tags/refresh
 */
export const refreshShopifyTags = async (_req: Request, res: Response) => {
    try {
        // Check if already refreshing
        const progress = getRefreshProgress();
        if (progress.isRefreshing) {
            return res.json({
                success: true,
                isRefreshing: true,
                progress,
                message: 'Refresh en progreso'
            });
        }

        console.log('[Push] Force refreshing tags cache...');

        // Start refresh in background
        refreshTagsCache()
            .then(tags => console.log(`[Push] Background refresh complete: ${tags.length} tags`))
            .catch(err => console.error('[Push] Background refresh failed:', err.message));

        res.json({
            success: true,
            isRefreshing: true,
            progress: getRefreshProgress(),
            message: 'Refresh iniciado en segundo plano'
        });
    } catch (error: any) {
        console.error('[Push] Error refreshing tags:', error);
        res.status(500).json({ success: false, error: error.message || 'Error del servidor' });
    }
};

/**
 * Get refresh progress status (super_admin only)
 * GET /api/v1/push/tags/status
 */
export const getRefreshStatus = async (_req: Request, res: Response) => {
    try {
        const progress = getRefreshProgress();
        const cacheAge = await getCacheAge();

        res.json({
            success: true,
            progress,
            cacheAgeMinutes: cacheAge
        });
    } catch (error: any) {
        console.error('[Push] Error getting refresh status:', error);
        res.status(500).json({ success: false, error: error.message || 'Error del servidor' });
    }
};

// ============ CUSTOMER BACKUP ENDPOINTS ============

/**
 * Sync all Shopify customers to backup (super_admin only)
 * POST /api/v1/push/customers/sync
 */
export const syncCustomersBackup = async (_req: Request, res: Response) => {
    try {
        console.log('[Push] Starting customer backup sync...');

        // Start sync in background
        syncAllCustomersToBackup()
            .then(result => console.log(`[Push] Customer sync complete: ${result.count} customers`))
            .catch(err => console.error('[Push] Customer sync failed:', err.message));

        res.json({
            success: true,
            message: 'Sincronización de clientes iniciada en segundo plano'
        });
    } catch (error: any) {
        console.error('[Push] Error starting customer sync:', error);
        res.status(500).json({ success: false, error: error.message || 'Error del servidor' });
    }
};

/**
 * Get customer backup stats (super_admin only)
 * GET /api/v1/push/customers/stats
 */
export const getCustomersBackupStats = async (_req: Request, res: Response) => {
    try {
        const stats = await getBackupStats();
        res.json({ success: true, stats });
    } catch (error: any) {
        console.error('[Push] Error getting backup stats:', error);
        res.status(500).json({ success: false, error: error.message || 'Error del servidor' });
    }
};

/**
 * Search customers in backup (super_admin only)
 * GET /api/v1/push/customers/search?q=query
 */
export const searchCustomers = async (req: Request, res: Response) => {
    try {
        const query = req.query.q as string;
        const limit = parseInt(req.query.limit as string) || 50;

        if (!query || query.length < 2) {
            return res.status(400).json({ success: false, error: 'Query debe tener al menos 2 caracteres' });
        }

        const customers = await searchCustomersInBackup(query, limit);
        res.json({ success: true, customers, count: customers.length });
    } catch (error: any) {
        console.error('[Push] Error searching customers:', error);
        res.status(500).json({ success: false, error: error.message || 'Error del servidor' });
    }
};

/**
 * Get customers by tag from backup (super_admin only)
 * GET /api/v1/push/customers/by-tag/:tag
 */
export const getCustomersByTag = async (req: Request, res: Response) => {
    try {
        const { tag } = req.params;
        const limit = parseInt(req.query.limit as string) || 100;

        if (!tag) {
            return res.status(400).json({ success: false, error: 'Tag requerido' });
        }

        const customers = await getCustomersByTagFromBackup(tag, limit);
        res.json({ success: true, customers, count: customers.length, tag });
    } catch (error: any) {
        console.error('[Push] Error getting customers by tag:', error);
        res.status(500).json({ success: false, error: error.message || 'Error del servidor' });
    }
};

// ============ WHATSAPP STATUS ENDPOINT ============

/**
 * Get WhatsApp (Whapi.cloud) connection status
 * GET /api/v1/push/whatsapp/status
 */
export const getWhatsAppStatus = async (_req: Request, res: Response) => {
    try {
        const status = await checkWhapiStatus();
        res.json({
            success: true,
            whatsapp: status
        });
    } catch (error: any) {
        console.error('[Push] Error getting WhatsApp status:', error);
        res.status(500).json({ success: false, error: error.message || 'Error del servidor' });
    }
};
