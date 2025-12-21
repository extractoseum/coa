import axios from 'axios';
import { supabase } from '../config/supabase';
import { notifyTrackingUpdate } from './onesignalService';
import { logSystemEvent } from './loggerService';

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

                    if (statusChanged || historyAdvanced) {
                        // Extract latest details for personalization
                        const latestEvent = result.history && result.history.length > 0 ? result.history[0].details : undefined;

                        // Notify user of update
                        await notifyTrackingUpdate(tracking.orders.client_id, tracking.orders.order_number, result.status, latestEvent);

                        // Log status change
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
                                    latest_detail: latestEvent
                                }
                            },
                            clientId: tracking.orders.client_id
                        });
                    }
                }
            } else {
                // Just update last checked time
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

        // Fallback for Delivered
        if (status !== 'delivered' && (html.includes('Estatus: Entregado') || (html.includes('Entregado') && html.includes('Firma de recibido')))) {
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
