import { supabase } from '../config/supabase';
import { AgentToolService } from './AgentToolService';

/**
 * VapiToolHandlers - Unified Wrapper for Voice Bot Tools
 * 
 * Delegating all data logic to AgentToolService while maintaining 
 * voice-specific formatting and legacy interface.
 */

export interface ToolCallContext {
    conversationId?: string;
    clientId?: string;
    customerPhone?: string;
    customerEmail?: string;
    auditCollector?: any; // Avoid circular dependency with AgentToolService
}

export interface ToolResult {
    success: boolean;
    message?: string;
    data?: any;
    error?: string;
}

export async function handleSendWhatsApp(
    args: { message: string },
    context: ToolCallContext
): Promise<ToolResult> {
    const result = await AgentToolService.getInstance().sendWhatsApp(args.message, context);
    return {
        success: !result.error,
        message: result.error ? `Error: ${result.error}` : 'Mensaje enviado correctamente.',
        data: result
    };
}

export async function handleSearchProducts(
    args: { query: string },
    context: ToolCallContext
): Promise<ToolResult> {
    const result = await AgentToolService.getInstance().searchProducts(args.query);

    if (result.count === 0) {
        return {
            success: false,
            message: `No encontré productos con "${args.query}". ¿Quieres que busque algo más específico?`
        };
    }

    const summary = result.results.map((p: any) => p.title).join(', ');
    return {
        success: true,
        message: `Encontré estos productos: ${summary}.`,
        data: result
    };
}

export async function handleGetCOA(
    args: { batch_number?: string; product_name?: string; send_whatsapp?: boolean },
    context: ToolCallContext
): Promise<ToolResult> {
    const result = await AgentToolService.getInstance().getCOA(args.batch_number, args.product_name);

    if (!result.found) {
        return { success: false, message: 'No encontré el certificado solicitado.' };
    }

    const coa = result.results[0];
    if (args.send_whatsapp) {
        await AgentToolService.getInstance().sendWhatsApp(`Aquí tienes el COA de ${coa.name}: ${coa.link}`, context);
    }

    return {
        success: true,
        message: `Encontré el COA de ${coa.name}. ¿Deseas que te lo envíe por WhatsApp?`,
        data: coa
    };
}

export async function handleLookupOrder(
    args: { order_number?: string },
    context: ToolCallContext
): Promise<ToolResult> {
    const result = await AgentToolService.getInstance().lookupOrder(args.order_number, context);

    if (!result.found) {
        return { success: false, message: 'No encontré pedidos asociados.' };
    }

    const order = result.orders[0];
    return {
        success: true,
        message: `Tu pedido ${order.order_number} está en estado: ${order.fulfillment_status}.`,
        data: order
    };
}

export async function handleCreateCoupon(
    args: { discount_percent: number; reason: string },
    context: ToolCallContext
): Promise<ToolResult> {
    const result = await AgentToolService.getInstance().createCoupon(args.discount_percent, args.reason, context);
    return {
        success: true,
        message: `Listo, te creé un cupón del ${args.discount_percent}%. El código es ${result.code}.`,
        data: result
    };
}

export async function handleGetClientInfo(
    args: {},
    context: ToolCallContext
): Promise<ToolResult> {
    const result = await AgentToolService.getInstance().getClientInfo(context.clientId, context.customerPhone);

    if (!result.found || !('client' in result)) {
        return { success: false, message: 'No encontré información del cliente.' };
    }

    const client = result.client!;
    return {
        success: true,
        message: `Cliente: ${client.name}. Pedidos: ${client.total_orders}.`,
        data: client
    };
}

export async function handleEscalateToHuman(
    args: { reason: string },
    context: ToolCallContext
): Promise<ToolResult> {
    const result = await AgentToolService.getInstance().escalateToHuman(args.reason, context);
    return {
        success: true,
        message: 'He transferido tu solicitud a un supervisor.',
        data: result
    };
}

/**
 * Legacy Router for Vapi/Voice Service
 */
export async function handleToolCall(
    toolName: string,
    args: any,
    context: ToolCallContext
): Promise<ToolResult> {
    switch (toolName) {
        case 'send_whatsapp':
        case 'function_tool_wa':
            return handleSendWhatsApp(args, context);
        case 'search_products':
        case 'buscar_productos':
            return handleSearchProducts(args, context);
        case 'get_coa':
        case 'get_coa_and_send':
        case 'cannabinoides-webhook':
            return handleGetCOA(args, context);
        case 'lookup_order':
        case 'consultar_pedido':
            return handleLookupOrder(args, context);
        case 'create_coupon':
        case 'crear_cupon':
            return handleCreateCoupon(args, context);
        case 'get_client_info':
        case 'lookup_client':
        case 'info_cliente':
            return handleGetClientInfo(args, context);
        case 'escalate_to_human':
        case 'escalar_humano':
            return handleEscalateToHuman(args, context);
        default:
            return { success: false, error: `Herramienta desconocida: ${toolName}` };
    }
}
