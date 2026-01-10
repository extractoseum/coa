
import { AgentToolService, ToolContext } from './AgentToolService';
import { logger } from '../utils/Logger';

export interface DispatchResult {
    success: boolean;
    message?: string;
    data?: any;
    error?: string;
}

export class ToolDispatcher {
    /**
     * Dispatch and execute a tool call centrally
     */
    public static async execute(
        toolName: string,
        args: any,
        context: ToolContext
    ): Promise<DispatchResult> {
        const agentToolService = AgentToolService.getInstance();

        logger.info(`[ToolDispatcher] Executing ${toolName} for client: ${context.clientId || 'unknown'}`);

        try {
            switch (toolName) {
                // MESSAGING
                case 'send_whatsapp':
                case 'function_tool_wa':
                case 'send_whatsapp_message':
                    const waResult = await agentToolService.sendWhatsApp(args.message || args.body, context);
                    return {
                        success: !waResult.error,
                        message: waResult.error ? `Error: ${waResult.error}` : 'Mensaje enviado correctamente.',
                        data: waResult
                    };

                // CATALOG / PRODUCTS
                case 'search_products':
                case 'buscar_productos':
                case 'search_products_db':
                    const searchResult = await agentToolService.searchProducts(args.query);
                    return {
                        success: searchResult.count > 0,
                        message: searchResult.count > 0
                            ? `Encontré estos productos: ${searchResult.results.map((p: any) => p.title).join(', ')}.`
                            : `No encontré productos con "${args.query}".`,
                        data: searchResult
                    };

                // COA
                case 'get_coa':
                case 'get_coa_and_send':
                case 'cannabinoides-webhook':
                    const coaResult = await agentToolService.getCOA(args.batch_number, args.product_name);
                    if (coaResult.found && args.send_whatsapp) {
                        const coa = coaResult.results[0];
                        await agentToolService.sendWhatsApp(`Aquí tienes el COA de ${coa.name}: ${coa.link}`, context);
                    }
                    return {
                        success: coaResult.found,
                        message: coaResult.found
                            ? `Encontré el COA de ${coaResult.results[0].name}.`
                            : 'No encontré el certificado solicitado.',
                        data: coaResult.results[0]
                    };

                // ORDERS
                case 'lookup_order':
                case 'consultar_pedido':
                case 'search_order_by_number':
                    const orderResult = await agentToolService.lookupOrder(args.order_number || args.order_id, context);
                    if (!orderResult.found) {
                        return { success: false, message: 'No encontré pedidos asociados.' };
                    }

                    if (orderResult.count > 1) {
                        const summary = orderResult.orders.map((o: any, i: number) =>
                            `${i + 1}. ${o.order_number}: ${o.fulfillment_status} ($${o.total} MXN)`
                        ).join('\n');
                        return {
                            success: true,
                            message: `Encontré ${orderResult.count} pedidos asociados:\n\n${summary}\n\n¿Quieres más detalles de alguno?`,
                            data: orderResult
                        };
                    }

                    const order = orderResult.orders[0];
                    return {
                        success: true,
                        message: `Tu pedido ${order.order_number} está en estado: ${order.fulfillment_status}.`,
                        data: order
                    };

                // COUPONS
                case 'create_coupon':
                case 'crear_cupon':
                    const couponResult = await agentToolService.createCoupon(args.discount_percent, args.reason, context);
                    return {
                        success: true,
                        message: `Listo, te creé un cupón del ${args.discount_percent}%. El código es ${couponResult.code}.`,
                        data: couponResult
                    };

                // CLIENT INFO
                case 'get_client_info':
                case 'lookup_client':
                case 'info_cliente':
                    const clientResult = await agentToolService.getClientInfo(context.clientId, context.customerPhone);
                    if (!clientResult.found || !('client' in clientResult)) {
                        return { success: false, message: 'No encontré información del cliente.' };
                    }
                    return {
                        success: true,
                        message: `Cliente: ${clientResult.client.name}. Pedidos: ${clientResult.client.total_orders}.`,
                        data: clientResult.client
                    };

                // ESCALATION
                case 'escalate_to_human':
                case 'escalar_humano':
                    const excResult = await agentToolService.escalateToHuman(args.reason, context);
                    return {
                        success: true,
                        message: 'He transferido tu solicitud a un supervisor.',
                        data: excResult
                    };

                // ADMIN & ANALYTICS
                case 'get_system_health':
                    return await agentToolService.getSystemHealth();

                case 'read_file_content':
                    return await agentToolService.readFileContent(args.file_path);

                case 'list_directory':
                    return await agentToolService.listDirectory(args.dir_path);

                case 'get_logs':
                    return await agentToolService.getLogs(args.type, args.lines);

                case 'get_active_clients_count_today':
                    return await agentToolService.getActiveClientsCountToday();

                case 'search_clients':
                    return await agentToolService.searchClients(args.query);

                case 'get_recent_orders':
                    return await agentToolService.getRecentOrders(args.limit);

                case 'search_shopify_customers':
                    return await agentToolService.searchShopifyCustomers(args.query);

                case 'get_customer_orders_live':
                    return await agentToolService.getCustomerOrdersLive(args.shopify_customer_id);

                case 'create_checkout_link':
                    return await agentToolService.createCheckoutLink(args.items);

                case 'get_recent_scans_details':
                    return await agentToolService.getRecentScansDetails(args.limit);

                case 'get_voice_call_history':
                    return await agentToolService.getVoiceCallHistory(args.conversation_id);

                case 'browser_action':
                    return await agentToolService.browserAction(args.action, args.target);

                case 'get_conversation_summary':
                    return await agentToolService.getConversationSummary(args.conversation_id);

                case 'get_contact_360':
                    return await agentToolService.getContact360(args.phone);

                case 'move_conversation_to_column':
                    return await agentToolService.moveConversationToColumn(args.conversation_id, args.column_name);

                case 'get_ai_usage_stats':
                    return await agentToolService.getAIUsageStats(args.days);

                case 'get_order_tracking':
                    return await agentToolService.getOrderTracking(args.order_id);

                case 'get_abandoned_checkouts':
                    return await agentToolService.getAbandonedCheckouts(args.limit);

                case 'audit_decision':
                    const auditResult = await agentToolService.auditDecision(args.message_id);
                    return {
                        success: !!auditResult,
                        message: auditResult
                            ? `Auditoría: ${auditResult}`
                            : 'No pude encontrar la traza de decisión para ese mensaje.',
                        data: auditResult
                    };

                default:
                    logger.warn(`[ToolDispatcher] Unknown tool: ${toolName}`);
                    return { success: false, error: `Herramienta desconocida: ${toolName}` };
            }
        } catch (error: any) {
            logger.error(`[ToolDispatcher] Execution error for ${toolName}:`, error);
            return { success: false, error: error.message || 'Error interno en la herramienta.' };
        }
    }
}
