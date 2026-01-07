import axios from 'axios';
import { notifyTrackingUpdate, notifyDeliveryAttemptFailed, notifyPackageAtOffice, notifyDeliveryDelay, notifyOrderShipped } from './onesignalService';
import { logSystemEvent } from './loggerService';
import { supabase } from '../config/supabase';

interface TrackingStatus {
    timestamp: string;
    status: string;
    details: string;
    location?: string;
}

export const updateOrderTracking = async (orderId: string) => {
    try {
        const { data: trackings, error } = await supabase
            .from('order_tracking')
            .select('*, orders(order_number, client_id)')
            .eq('order_id', orderId);

        if (error) throw error;
        if (!trackings || trackings.length === 0) return;

        for (const tracking of trackings) {
            const trackingNum = tracking.tracking_number;
            let carrier = tracking.carrier;

            if (trackingNum.startsWith('EST-') || trackingNum.length === 22) {
                const cleanNum = trackingNum.replace('EST-', '');
                const result = await pollEstafeta(cleanNum);
                if (result) {
                    const statusChanged = result.status !== tracking.current_status;
                    const historyAdvanced = result.history && result.history.length > (tracking.status_history?.length || 0);

                    const updateData: any = {
                        current_status: result.status,
                        status_history: result.history,
                        last_checked_at: new Date().toISOString()
                    };

                    // Add enriched metadata if present
                    if (result.trackingCode) updateData.tracking_code = result.trackingCode;
                    if (result.serviceType) updateData.service_type = result.serviceType;
                    if (result.estimatedDelivery) updateData.estimated_delivery = result.estimatedDelivery;

                    await supabase
                        .from('order_tracking')
                        .update(updateData)
                        .eq('id', tracking.id);

                    // BUG FIX: Only notify on relevant status changes, NOT on simple history advances
                    // Relevance: out_for_delivery, delivered, or the initial switch to in_transit
                    const notifiableStatuses = ['out_for_delivery', 'delivered', 'exception'];

                    // Logic to prevent "downgrade" notifications (e.g., Out for Delivery -> In Transit)
                    // We allow In Transit -> Out for Delivery
                    // We start with isInitialTransit
                    const isInitialTransit = (tracking.current_status === 'pending' || !tracking.current_status) && result.status === 'in_transit';
                    let shouldNotify = false;

                    if (isInitialTransit) {
                        shouldNotify = true;
                    } else if (statusChanged) {
                        // If upgrading (Transit -> Out for Delivery -> Delivered)
                        if (notifiableStatuses.includes(result.status)) {
                            shouldNotify = true;
                        }

                        // Prevent Downgrade Spam: 
                        // If we were 'out_for_delivery' and now 'in_transit', DO NOT notify "On the way" again.
                        if (tracking.current_status === 'out_for_delivery' && result.status === 'in_transit') {
                            shouldNotify = false;
                            console.log(`[Tracking] Suppressing downgrade notification (Out -> Transit) for ${trackingNum}`);
                        }
                    }

                    if (shouldNotify) {
                        // Extract latest details for personalization
                        const latestEvent = result.history && result.history.length > 0 ? result.history[0].details : undefined;
                        const currentLocation = result.history && result.history.length > 0 ? result.history[0].location : undefined;

                        // SMART NOTIFICATION: First movement = package was picked up by carrier
                        // Send the "actually in transit" notification instead of generic tracking update
                        if (isInitialTransit) {
                            console.log(`[Tracking] First movement detected for ${trackingNum} - sending PICKED UP notification`);
                            await notifyOrderShipped(
                                tracking.orders.client_id,
                                tracking.orders.order_number,
                                carrier,
                                trackingNum,
                                undefined, // clientData
                                result.estimatedDelivery,
                                result.serviceType,
                                true // isPickedUp = true - package is actually moving now
                            );
                        } else {
                            // Regular tracking update (out_for_delivery, delivered, etc.)
                            await notifyTrackingUpdate(
                                tracking.orders.client_id,
                                tracking.orders.order_number,
                                result.status,
                                latestEvent,
                                undefined,
                                currentLocation
                            );
                        }
                    }

                    // NEW: Proactive Detection of problematic statuses in history
                    if (result.history && result.history.length > 0) {
                        const latest = result.history[0];
                        const lowerDetails = latest.details.toLowerCase();
                        const lastSavedDetails = tracking.status_history && tracking.status_history.length > 0
                            ? tracking.status_history[0].details.toLowerCase()
                            : '';

                        // Only trigger proactive alerts if they are NEW in the history
                        if (lowerDetails !== lastSavedDetails) {
                            // 1. Failed Delivery Attempt
                            if (lowerDetails.includes('intento') && lowerDetails.includes('fallido')) {
                                await notifyDeliveryAttemptFailed(tracking.orders.client_id, tracking.orders.order_number, latest.details);
                            }
                            // 2. Package at Office / Ready for Pickup
                            else if (lowerDetails.includes('disponible') && (lowerDetails.includes('oficina') || lowerDetails.includes('sucursal') || lowerDetails.includes('ventanilla'))) {
                                await notifyPackageAtOffice(tracking.orders.client_id, tracking.orders.order_number, latest.location);
                            }
                        }
                    }

                    // NEW: Delivery Delay Check
                    if (result.status !== 'delivered' && result.estimatedDelivery) {
                        const estDate = new Date(result.estimatedDelivery);
                        const now = new Date();
                        // If today > estimated date AND we haven't notified delay yet (check logs)
                        if (now > estDate) {
                            // Check system logs to avoid spamming delay alerts (once per order)
                            const { data: delayLog } = await supabase
                                .from('system_logs')
                                .select('id')
                                .eq('event_type', 'delivery_delay_sent')
                                .eq('client_id', tracking.orders.client_id)
                                .contains('payload', { orderNumber: tracking.orders.order_number })
                                .limit(1);

                            if (!delayLog || delayLog.length === 0) {
                                await notifyDeliveryDelay(tracking.orders.client_id, tracking.orders.order_number);
                            }
                        }
                    }

                    // Log status change (always log if status changed, even if not notifiable)
                    await logSystemEvent({
                        category: 'order',
                        eventType: 'tracking_status_changed',
                        payload: {
                            order_id: orderId,
                            tracking_number: trackingNum,
                            old_status: tracking.current_status,
                            new_status: result.status,
                            history_advanced: historyAdvanced,
                            carrier,
                            metadata: {
                                tracking_code: result.trackingCode,
                                service_type: result.serviceType,
                                estimated_delivery: result.estimatedDelivery,
                                latest_detail: result.history && result.history.length > 0 ? result.history[0].details : undefined
                            }
                        },
                        clientId: tracking.orders.client_id
                    });
                }
            } else {
                // Just update last checked time for non-Estafeta carriers
                await supabase
                    .from('order_tracking')
                    .update({ last_checked_at: new Date().toISOString() })
                    .eq('id', tracking.id);
            }
        }

    } catch (error) {
        console.error('[TrackingService] Error updating tracking:', error);
    }
};

/**
 * Update all active trackings (Cron job entry point)
 */
export const updateAllActiveTrackings = async () => {
    try {
        console.log('[TrackingCron] Starting update for all active trackings...');
        // Only track orders that are not delivered yet and have tracking info
        const { data: trackings, error } = await supabase
            .from('order_tracking')
            .select('order_id')
            .not('current_status', 'eq', 'delivered')
            .order('last_checked_at', { ascending: true });

        if (error) throw error;
        if (!trackings || trackings.length === 0) {
            console.log('[TrackingCron] No active trackings found.');
            return;
        }

        console.log(`[TrackingCron] Updating ${trackings.length} trackings...`);
        for (const tracking of trackings) {
            await updateOrderTracking(tracking.order_id);
            // Small delay to avoid rate limiting
            await new Promise(resolve => setTimeout(resolve, 3000));
        }
        console.log('[TrackingCron] Batch update completed.');
    } catch (error) {
        console.error('[TrackingCron] Error in batch update:', error);
    }
};

/**
 * Poll Estafeta tracking page (Scraper approach)
 */
export const pollEstafeta = async (waybill: string) => {
    try {
        const url = `https://cs.estafeta.com/es/Tracking/searchByGet?wayBill=${waybill}&wayBillType=0&isShipmentDetail=True`;

        const response = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/92.0.4515.159 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.9',
                'Accept-Language': 'es-MX,es;q=0.9,en-US;q=0.8,en;q=0.7'
            }
        });

        const html = response.data;

        // Detect Status
        let status = 'in_transit';

        // Use ONLY specific markers for current status to avoid false positives
        if (html.match(/fontColorCurrentProcess["']>\s*Entregado/i)) {
            status = 'delivered';
        } else if (html.match(/fontColorCurrentProcess["']>\s*(En Proceso de Entrega|En reparto)/i)) {
            status = 'out_for_delivery';
        } else if (html.match(/fontColorCurrentProcess["']>\s*(En Tránsito|Recibido por Estafeta|Recolectado)/i)) {
            status = 'in_transit';
        } else if (html.includes('no encontrado') || html.includes('movimiento no encontrado')) {
            status = 'pending';
        }

        // Exception Handling (Vacations, Closed, etc.)
        if (html.includes('VACACIONES') || html.includes('NO LABORAL') || html.includes('CERRADO')) {
            // Check if we were already out for delivery -> likely an attempt failed due to closed location
            // We map this to 'exception' to handle it specifically via `notifyDeliveryAttemptFailed` logic later
            // But for status, let's keep it actionable.
            status = 'exception';
        }

        // Return to Sender / Replacement Guide Detection
        // Check for 'Guía Retorno' (even empty implies existence) or explicit event text
        if (html.includes('DEVOLUCION A REMITENTE') || html.includes('GUIA DE REEMPLAZO') || html.includes('Guía Retorno')) {
            status = 'return_to_sender';
        }

        // Fallback for Delivered
        // STRENGTHENED: Avoid matching footer text "no ha sido entregado" by checking for Estatus label
        const isExplicitDelivered = html.includes('Estatus: Entregado') ||
            (html.includes('Entregado') && html.includes('Firma de recibido'));

        if (status !== 'delivered' && status !== 'return_to_sender' && isExplicitDelivered) {
            status = 'delivered';
        }

        // Estafeta Tooltip Parsing (More robust)
        // Format: title=\"11:26&lt;br&gt;19/12/2025&lt;br&gt;TOLUCA (ZONA DOS)\"
        const tooltipRegex = /title="(\d{2}:\d{2})&lt;br&gt;(\d{2}\/\d{2}\/\d{4})&lt;br&gt;([^"]+)"/g;
        let match;
        const eventMap = new Map<string, TrackingStatus>();

        while ((match = tooltipRegex.exec(html)) !== null) {
            const [_, time, date, location] = match;
            const timestamp = `${date} ${time}`;

            // Look for a description nearby (like "En proceso de entrega a oficina")
            const lookSnippet = html.substring(match.index + match[0].length, match.index + 800);
            const errorMatch = lookSnippet.match(/stateErrorInfo.*?title="([^"]+)"/i);
            const nextMatch = lookSnippet.match(/title="([^"]+)"/i);

            let details = 'En tránsito';
            if (errorMatch) {
                details = errorMatch[1];
            } else if (nextMatch && !nextMatch[1].match(/\d{2}:\d{2}/)) {
                details = nextMatch[1];
            }

            eventMap.set(timestamp, {
                timestamp,
                status: 'in_transit',
                details: details.trim(),
                location: location.trim().replace(/&lt;br&gt;/g, ' ')
            });
        }

        let history: TrackingStatus[] = Array.from(eventMap.values()).map(event => {
            let eventStatus = 'in_transit';
            const lowerDetails = event.details.toLowerCase();
            if (lowerDetails.includes('entregado')) eventStatus = 'delivered';
            else if (lowerDetails.includes('entrega') || lowerDetails.includes('reparto') || lowerDetails.includes('oficina') || lowerDetails.includes('disponible')) {
                eventStatus = 'out_for_delivery';
            }
            return { ...event, status: eventStatus };
        });

        // Special fallback
        if (history.length === 0) {
            const dateRegex = /(\d{2}\/\d{2}\/\d{4} \d{2}:\d{2})/g;
            const matches = html.match(dateRegex);
            if (matches) {
                for (const dateStr of matches) {
                    const idx = html.indexOf(dateStr);
                    const nearbyText = html.substring(idx, idx + 200).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
                    history.push({
                        timestamp: dateStr,
                        status: nearbyText.toLowerCase().includes('entregado') ? 'delivered' : nearbyText.toLowerCase().includes('entrega') ? 'out_for_delivery' : 'in_transit',
                        details: nearbyText.substring(0, 100),
                        location: 'México'
                    });
                }
            }
        }

        // Helper to convert DD/MM/YYYY HH:MM to comparable number
        const getSortable = (dStr: string) => {
            const parts = dStr.split(/[\s/:]+/);
            if (parts.length < 5) return 0;
            return new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]), parseInt(parts[3]), parseInt(parts[4])).getTime();
        };

        // Extract metadata
        let trackingCode = '';
        let serviceType = '';
        let estimatedDelivery = '';

        const tcMatch = html.match(/Número de rastreo:?\s*<\/p>\s*<p[^>]*>\s*(\d+)/i);
        if (tcMatch) trackingCode = tcMatch[1];

        const stMatch = html.match(/Tipo de servicio:?\s*<\/p>\s*<p[^>]*>\s*([^<]+)/i);
        if (stMatch) serviceType = stMatch[1].trim();

        const edMatch = html.match(/fechaEstimadaInfo["']>\s*(\d{2})\s*(\d{2})\s*(\d{4})/);
        if (edMatch) {
            const [_, day, month, year] = edMatch;
            estimatedDelivery = new Date(`${year}-${month}-${day}T23:59:59`).toISOString();
        }

        return {
            status,
            trackingCode,
            serviceType,
            estimatedDelivery,
            history: history.sort((a, b) => getSortable(b.timestamp) - getSortable(a.timestamp))
        };

    } catch (error: any) {
        console.error('[Estafeta] Scraper error:', error.message);
        return null;
    }
};

const getStatusText = (status: string) => {
    switch (status) {
        case 'delivered': return 'Entregado';
        case 'out_for_delivery': return 'En Reparto';
        case 'in_transit': return 'En Tránsito';
        case 'pending': return 'Pendiente';
        default: return status;
    }
};
