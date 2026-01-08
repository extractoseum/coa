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
import {
    sendBulkMarketingEmail,
    isBulkEmailConfigured,
    getAraEmailStatus,
    fetchAraEmails,
    processIncomingAraEmail,
    startEmailPolling
} from '../services/emailService';

/**
 * Register a device for push notifications
 * POST /api/v1/push/register
 */
export const registerDevice = async (req: Request, res: Response) => {
    try {
        const clientId = (req as any).client?.id;
        const { playerId, platform, isNativeApp, isPWA, deviceInfo } = req.body;

        if (!clientId) {
            return res.status(401).json({ success: false, error: 'No autenticado' });
        }

        if (!playerId) {
            return res.status(400).json({ success: false, error: 'Player ID requerido' });
        }

        // Log platform info for debugging
        console.log(`[Push] Registering device for ${clientId}: platform=${platform}, isNativeApp=${isNativeApp}, isPWA=${isPWA}`);

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

// Rate limiting: Track recent sends per admin to prevent spam
const recentAdminSends: Map<string, number[]> = new Map();
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX_SENDS = 5; // Max 5 sends per minute per admin

/**
 * Interface for vibe filters (Marketing Empático)
 */
interface VibeFilters {
    includeVibeCategories?: string[];   // e.g., ['excited', 'satisfied']
    excludeVibeCategories?: string[];   // e.g., ['frustrated']
    maxFrictionScore?: number;          // e.g., 50 (exclude high friction)
    minIntentScore?: number;            // e.g., 40 (only warm/hot leads)
}

/**
 * Build SQL conditions for vibe filtering
 * Returns an array of conditions to be applied to shopify_customers_backup queries
 */
const buildVibeQueryConditions = (vibeFilters: VibeFilters): {
    excludeVibes: string[];
    includeVibes: string[];
    excludeFriction: string[];
    includeIntent: string[];
} => {
    const excludeVibes: string[] = vibeFilters.excludeVibeCategories || [];
    const includeVibes: string[] = vibeFilters.includeVibeCategories || [];
    const excludeFriction: string[] = [];
    const includeIntent: string[] = [];

    // If maxFrictionScore is set, exclude high friction
    if (vibeFilters.maxFrictionScore !== undefined && vibeFilters.maxFrictionScore < 70) {
        excludeFriction.push('high');
    }

    // If minIntentScore is set, determine which intent levels to include
    if (vibeFilters.minIntentScore !== undefined) {
        if (vibeFilters.minIntentScore >= 70) {
            includeIntent.push('hot');
        } else if (vibeFilters.minIntentScore >= 40) {
            includeIntent.push('hot', 'warm');
        }
    }

    return { excludeVibes, includeVibes, excludeFriction, includeIntent };
};

/**
 * Send a push notification (super_admin only)
 * Supports multiple channels: push (OneSignal) and whatsapp (Whapi.cloud)
 * POST /api/v1/push/send
 */
export const sendNotification = async (req: Request, res: Response) => {
    try {
        const clientId = (req as any).client?.id;
        const { title, message, targetType, targetValue, imageUrl, data, scheduledFor, channels, individualCustomer, idempotencyKey, vibeFilters } = req.body;

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

        // --- RATE LIMITING ---
        // Prevent admin from spamming notifications (max 5 per minute)
        const now = Date.now();
        const adminKey = clientId || 'anonymous';
        const adminSends = recentAdminSends.get(adminKey) || [];

        // Clean old entries outside the window
        const recentSends = adminSends.filter(ts => now - ts < RATE_LIMIT_WINDOW_MS);

        if (recentSends.length >= RATE_LIMIT_MAX_SENDS) {
            console.warn(`[Push] Rate limit exceeded for admin ${adminKey}`);
            return res.status(429).json({
                success: false,
                error: `Demasiadas notificaciones. Espera ${Math.ceil((recentSends[0] + RATE_LIMIT_WINDOW_MS - now) / 1000)} segundos.`
            });
        }

        // --- IDEMPOTENCY CHECK ---
        // Prevent duplicate sends from double-clicks or retries
        if (idempotencyKey) {
            const { data: existingNotif } = await supabase
                .from('push_notifications')
                .select('id')
                .eq('idempotency_key', idempotencyKey)
                .maybeSingle();

            if (existingNotif) {
                console.log(`[Push] Duplicate request blocked (idempotency key: ${idempotencyKey})`);
                return res.status(200).json({
                    success: true,
                    message: 'Notificación ya fue enviada anteriormente',
                    duplicate: true
                });
            }
        }

        // Record this send attempt for rate limiting
        recentSends.push(now);
        recentAdminSends.set(adminKey, recentSends);

        let pushResult: any = null;
        let whatsappQueued = false;
        let notificationId: string | null = null;

        // Send via Push (OneSignal) if selected
        // Skip push for individual targeting (we don't have client_id from Shopify customer)
        const shouldSendPush = selectedChannels.includes('push') && targetType !== 'individual';

        if (shouldSendPush) {
            // Log vibe filters if present (Smart Option D)
            if (vibeFilters && Object.keys(vibeFilters).length > 0) {
                console.log('[Push] Vibe-based broadcasting enabled:', vibeFilters);
            }

            pushResult = await onesignal.sendNotification({
                title,
                message,
                targetType,
                targetValue,
                imageUrl,
                data,
                scheduledFor: scheduledFor ? new Date(scheduledFor) : undefined,
                sentBy: clientId,
                channels: selectedChannels,
                vibeFilters  // Smart Option D: Pass vibe filters
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

            // Build vibe filter conditions if Marketing Empático is enabled
            const hasVibeFilters = vibeFilters && Object.keys(vibeFilters).length > 0;
            const vibeConditions = hasVibeFilters ? buildVibeQueryConditions(vibeFilters) : null;

            if (targetType === 'all') {
                // Get all phones from backup with optional vibe filtering
                let query = supabase
                    .from('shopify_customers_backup')
                    .select('phone, vibe_category, friction_level, intent_level')
                    .not('phone', 'is', null)
                    .neq('phone', '');

                // Apply vibe filters if Marketing Empático is enabled
                if (vibeConditions) {
                    // Exclude frustrated users
                    if (vibeConditions.excludeVibes.length > 0) {
                        // Users with these vibes OR null vibe (unknown) - we exclude the known bad ones
                        for (const vibe of vibeConditions.excludeVibes) {
                            query = query.neq('vibe_category', vibe);
                        }
                    }
                    // Include only specific vibes (if set)
                    if (vibeConditions.includeVibes.length > 0) {
                        query = query.in('vibe_category', vibeConditions.includeVibes);
                    }
                    // Exclude high friction
                    if (vibeConditions.excludeFriction.length > 0) {
                        for (const level of vibeConditions.excludeFriction) {
                            query = query.neq('friction_level', level);
                        }
                    }
                    // Include only certain intent levels
                    if (vibeConditions.includeIntent.length > 0) {
                        query = query.in('intent_level', vibeConditions.includeIntent);
                    }
                }

                const { data: customers } = await query;
                phones = (customers || []).map(c => c.phone).filter(Boolean);

                if (hasVibeFilters) {
                    console.log(`[Push] WhatsApp vibe filtering applied: ${phones.length} recipients after filter`);
                }
            } else if (targetType === 'tag' && targetValue) {
                // Get phones by tag with optional vibe filtering
                let customers = await getCustomersByTagFromBackup(targetValue, 5000);

                // Apply vibe filters in-memory if enabled (since getCustomersByTagFromBackup doesn't support vibe filters)
                if (vibeConditions && customers.length > 0) {
                    const beforeCount = customers.length;

                    // We need to fetch vibe data for these customers
                    const customerEmails = customers.filter(c => c.email).map(c => c.email!.toLowerCase());
                    if (customerEmails.length > 0) {
                        const { data: vibeData } = await supabase
                            .from('shopify_customers_backup')
                            .select('email, vibe_category, friction_level, intent_level')
                            .in('email', customerEmails);

                        if (vibeData) {
                            const vibeMap = new Map(vibeData.map(v => [v.email?.toLowerCase(), v]));

                            customers = customers.filter(c => {
                                if (!c.email) return true; // Keep customers without email (can't filter them)
                                const vibe = vibeMap.get(c.email.toLowerCase());
                                if (!vibe) return true; // No vibe data, keep them

                                // Exclude bad vibes
                                if (vibeConditions.excludeVibes.includes(vibe.vibe_category)) return false;

                                // Include only good vibes (if specified)
                                if (vibeConditions.includeVibes.length > 0 && !vibeConditions.includeVibes.includes(vibe.vibe_category)) return false;

                                // Exclude high friction
                                if (vibeConditions.excludeFriction.includes(vibe.friction_level)) return false;

                                // Include only certain intent (if specified)
                                if (vibeConditions.includeIntent.length > 0 && !vibeConditions.includeIntent.includes(vibe.intent_level)) return false;

                                return true;
                            });
                        }
                    }

                    console.log(`[Push] WhatsApp vibe filtering: ${beforeCount} -> ${customers.length} recipients`);
                }

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
                            sent_at: new Date().toISOString(),
                            idempotency_key: idempotencyKey || null
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

        // Send via Email (Ara) if selected
        let emailQueued = false;
        if (selectedChannels.includes('email') && isBulkEmailConfigured()) {
            // Get emails based on targetType
            let emails: string[] = [];

            // Reuse vibeConditions from WhatsApp section if Marketing Empático is enabled
            const hasVibeFilters = vibeFilters && Object.keys(vibeFilters).length > 0;
            const vibeConditions = hasVibeFilters ? buildVibeQueryConditions(vibeFilters) : null;

            if (targetType === 'all') {
                // Get all emails from backup with optional vibe filtering
                let query = supabase
                    .from('shopify_customers_backup')
                    .select('email, vibe_category, friction_level, intent_level')
                    .not('email', 'is', null)
                    .neq('email', '');

                // Apply vibe filters if Marketing Empático is enabled
                if (vibeConditions) {
                    if (vibeConditions.excludeVibes.length > 0) {
                        for (const vibe of vibeConditions.excludeVibes) {
                            query = query.neq('vibe_category', vibe);
                        }
                    }
                    if (vibeConditions.includeVibes.length > 0) {
                        query = query.in('vibe_category', vibeConditions.includeVibes);
                    }
                    if (vibeConditions.excludeFriction.length > 0) {
                        for (const level of vibeConditions.excludeFriction) {
                            query = query.neq('friction_level', level);
                        }
                    }
                    if (vibeConditions.includeIntent.length > 0) {
                        query = query.in('intent_level', vibeConditions.includeIntent);
                    }
                }

                const { data: customers } = await query;
                emails = (customers || []).map(c => c.email).filter(Boolean);

                if (hasVibeFilters) {
                    console.log(`[Push] Email vibe filtering applied: ${emails.length} recipients after filter`);
                }
            } else if (targetType === 'tag' && targetValue) {
                // Get emails by tag with optional vibe filtering
                let customers = await getCustomersByTagFromBackup(targetValue, 5000);

                // Apply vibe filters in-memory
                if (vibeConditions && customers.length > 0) {
                    const beforeCount = customers.length;
                    const customerEmails = customers.filter(c => c.email).map(c => c.email!.toLowerCase());

                    if (customerEmails.length > 0) {
                        const { data: vibeData } = await supabase
                            .from('shopify_customers_backup')
                            .select('email, vibe_category, friction_level, intent_level')
                            .in('email', customerEmails);

                        if (vibeData) {
                            const vibeMap = new Map(vibeData.map(v => [v.email?.toLowerCase(), v]));
                            customers = customers.filter(c => {
                                if (!c.email) return true;
                                const vibe = vibeMap.get(c.email.toLowerCase());
                                if (!vibe) return true;
                                if (vibeConditions.excludeVibes.includes(vibe.vibe_category)) return false;
                                if (vibeConditions.includeVibes.length > 0 && !vibeConditions.includeVibes.includes(vibe.vibe_category)) return false;
                                if (vibeConditions.excludeFriction.includes(vibe.friction_level)) return false;
                                if (vibeConditions.includeIntent.length > 0 && !vibeConditions.includeIntent.includes(vibe.intent_level)) return false;
                                return true;
                            });
                        }
                    }
                    console.log(`[Push] Email vibe filtering: ${beforeCount} -> ${customers.length} recipients`);
                }

                emails = customers.filter(c => c.email).map(c => c.email!);
            } else if (targetType === 'individual') {
                // Get email from individual customer data
                if (individualCustomer?.email) {
                    emails = [individualCustomer.email];
                    console.log(`[Push] Individual Email to: ${individualCustomer.email}`);
                }
            }

            if (emails.length > 0) {
                // Ensure we have a notification ID for tracking
                if (!notificationId) {
                    console.log('[Push] Creating notification record for Email tracking...');
                    const { data: notification, error: notifError } = await supabase
                        .from('push_notifications')
                        .insert({
                            title,
                            message,
                            target_type: targetType,
                            target_value: targetValue,
                            sent_by: clientId,
                            status: 'sent',
                            sent_at: new Date().toISOString(),
                            idempotency_key: idempotencyKey || null
                        })
                        .select('id')
                        .single();

                    if (!notifError && notification) {
                        notificationId = notification.id;
                    }
                }

                // Build email subject
                const emailSubject = `[EUM] ${title}`;

                console.log(`[Push] Queueing Email to ${emails.length} recipients via ara@extractoseum.com...`);

                // Send in background to not block response
                if (notificationId) {
                    sendBulkMarketingEmail(emails, emailSubject, title, message, notificationId, imageUrl)
                        .then(result => {
                            console.log(`[Push] Email complete: ${result.sent} sent, ${result.failed} failed`);
                        })
                        .catch(err => {
                            console.error('[Push] Email error:', err);
                        });
                    console.log(`[Push] sendBulkMarketingEmail called (async)`);
                }

                emailQueued = true;
            } else {
                console.log('[Push] No emails found for Email targeting');
            }
        }

        // Check if at least one channel succeeded
        const pushSucceeded = pushResult?.success === true;
        const whatsappSucceeded = whatsappQueued === true;
        const emailSucceeded = emailQueued === true;

        // If no channel succeeded, return error
        if (!pushSucceeded && !whatsappSucceeded && !emailSucceeded) {
            // Determine the error message
            let errorMsg = 'No se pudo enviar la notificacion';
            if (selectedChannels.includes('push') && targetType === 'individual') {
                errorMsg = 'Push no disponible para usuario individual. Selecciona WhatsApp o Email.';
            } else if (selectedChannels.includes('whatsapp') && !whatsappQueued) {
                errorMsg = 'No se encontró teléfono para este usuario';
            } else if (selectedChannels.includes('email') && !emailQueued) {
                errorMsg = 'No se encontró email para este usuario';
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
                    ? 'Mensajes de WhatsApp en cola de envío (con rate limiting natural)'
                    : 'No se encontraron teléfonos para enviar'
            };
        }

        if (selectedChannels.includes('email')) {
            response.email = {
                queued: emailQueued,
                message: emailQueued
                    ? 'Emails en cola de envío via ara@extractoseum.com'
                    : 'No se encontraron emails para enviar'
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

/**
 * Get Email (Ara) service status
 * GET /api/v1/push/email/status or /api/v1/push/email/health
 * Add ?poll=true to force a poll cycle
 */
export const getEmailStatus = async (req: Request, res: Response) => {
    try {
        const status = getAraEmailStatus();

        // If polling not started but configured, try to start it
        if (status.configured && !status.polling) {
            console.log('[Push] Email configured but not polling - starting now...');
            startEmailPolling(60000);
        }

        // Force poll if requested
        let pollResult = null;
        if (req.query.poll === 'true' && status.configured) {
            console.log('[Push] Manual poll requested...');
            try {
                const emails = await fetchAraEmails();
                pollResult = { found: emails.length, processed: 0 };
                for (const email of emails) {
                    const convId = await processIncomingAraEmail(email);
                    if (convId) pollResult.processed++;
                }
            } catch (pollError: any) {
                pollResult = { error: pollError.message };
            }
        }

        res.json({
            success: true,
            email: {
                configured: status.configured,
                address: status.email,
                polling: status.polling
            },
            ...(pollResult && { pollResult })
        });
    } catch (error: any) {
        console.error('[Push] Error getting Email status:', error);
        res.status(500).json({ success: false, error: error.message || 'Error del servidor' });
    }
};
