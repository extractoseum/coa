
import { supabase } from '../config/supabase';
import { logger } from '../utils/Logger';

export type NotificationType =
    | 'order_update'
    | 'coa_ready'
    | 'promotion'
    | 'ara_message'
    | 'support_reply'
    | 'system';

export interface CreateNotificationParams {
    clientId: string;
    type: NotificationType;
    title: string;
    body: string;
    data?: Record<string, any>;
}

export class NotificationService {
    private static instance: NotificationService;

    private constructor() { }

    public static getInstance(): NotificationService {
        if (!NotificationService.instance) {
            NotificationService.instance = new NotificationService();
        }
        return NotificationService.instance;
    }

    /**
     * Create a notification for a client
     */
    async createNotification(params: CreateNotificationParams) {
        try {
            const { data, error } = await supabase
                .from('client_notifications')
                .insert({
                    client_id: params.clientId,
                    type: params.type,
                    title: params.title,
                    body: params.body,
                    data: params.data || {}
                })
                .select()
                .single();

            if (error) {
                logger.error('[NotificationService] Error creating notification:', error);
                return { success: false, error };
            }

            logger.info(`[NotificationService] Created ${params.type} notification for client ${params.clientId}`);
            return { success: true, notification: data };
        } catch (error: any) {
            logger.error('[NotificationService] Exception creating notification:', error);
            return { success: false, error };
        }
    }

    /**
     * Create an order update notification
     */
    async createOrderNotification(clientId: string, orderNumber: string, status: string, orderId?: string) {
        const statusMap: Record<string, string> = {
            'paid': 'Pago confirmado',
            'fulfilled': 'Pedido enviado',
            'shipped': 'Pedido en camino',
            'delivered': 'Pedido entregado',
            'cancelled': 'Pedido cancelado'
        };

        const title = `Actualización de pedido: ${orderNumber}`;
        const body = `Tu pedido ha cambiado a: ${statusMap[status] || status}`;

        return this.createNotification({
            clientId,
            type: 'order_update',
            title,
            body,
            data: { order_number: orderNumber, order_id: orderId, status }
        });
    }

    /**
     * Create a COA ready notification
     */
    async createCoaNotification(clientId: string, coaName: string, coaToken: string) {
        return this.createNotification({
            clientId,
            type: 'coa_ready',
            title: '¡Nuevo COA disponible!',
            body: `El certificado para "${coaName}" ya está listo.`,
            data: { coa_name: coaName, coa_token: coaToken }
        });
    }

    /**
     * Create a review notification (e.g. review approved)
     */
    async createReviewNotification(clientId: string, coaName: string, approved: boolean = true) {
        return this.createNotification({
            clientId,
            type: 'system',
            title: approved ? '¡Reseña aprobada!' : 'Actualización de reseña',
            body: approved
                ? `Tu reseña sobre "${coaName}" ha sido aprobada y ya es pública.`
                : `Tu reseña sobre "${coaName}" ha sido revisada por nuestro equipo.`,
            data: { coa_name: coaName, status: approved ? 'approved' : 'reviewed' }
        });
    }

    /**
     * Create a loyalty/membership update notification
     */
    async createLoyaltyNotification(clientId: string, tierName: string) {
        return this.createNotification({
            clientId,
            type: 'system',
            title: '¡Tu nivel de membresía ha cambiado!',
            body: `Felicidades, ahora eres nivel: ${tierName}.`,
            data: { tier: tierName }
        });
    }

    /**
     * Create a system notification (e.g. fraud alert)
     */
    async createSystemNotification(clientId: string, title: string, body: string, data?: Record<string, any>) {
        return this.createNotification({
            clientId,
            type: 'system',
            title,
            body,
            data: data || {}
        });
    }
}
