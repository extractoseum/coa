/**
 * VapiToolHandlers - Handlers for VAPI tool calls during voice conversations
 *
 * These handlers are invoked when Ara (VAPI assistant) makes tool calls.
 * Each handler executes the requested action and returns a result for Ara to use.
 */

import { supabase } from '../config/supabase';
import { sendWhatsAppMessage } from './whapiService';
import { normalizePhone, cleanupPhone } from '../utils/phoneUtils';

interface ToolCallContext {
    conversationId?: string;
    clientId?: string;
    customerPhone?: string;
}

interface ToolResult {
    success: boolean;
    message?: string;
    data?: any;
    error?: string;
}

/**
 * Tool: send_whatsapp
 * Sends a WhatsApp message to the customer during the call
 */
export async function handleSendWhatsApp(
    args: { message: string; media_url?: string },
    context: ToolCallContext
): Promise<ToolResult> {
    const { message, media_url } = args;
    const { customerPhone, conversationId } = context;

    if (!customerPhone) {
        return { success: false, error: 'No se pudo identificar el teléfono del cliente' };
    }

    try {
        console.log(`[VapiTools] Sending WhatsApp to ${customerPhone}: ${message.substring(0, 50)}...`);

        const result = await sendWhatsAppMessage({
            to: customerPhone,
            body: message
        });

        if (result.sent) {
            // Log in CRM messages if we have conversation context
            if (conversationId) {
                await supabase.from('crm_messages').insert({
                    conversation_id: conversationId,
                    direction: 'outbound',
                    role: 'assistant',
                    message_type: media_url ? 'image' : 'text',
                    content: message,
                    status: 'sent',
                    raw_payload: { source: 'vapi_tool_call', media_url }
                });
            }

            return {
                success: true,
                message: 'Mensaje enviado por WhatsApp exitosamente',
                data: { messageId: result.message?.id }
            };
        } else {
            return {
                success: false,
                error: result.error || 'Error enviando mensaje de WhatsApp'
            };
        }
    } catch (error: any) {
        console.error('[VapiTools] send_whatsapp error:', error.message);
        return { success: false, error: error.message };
    }
}

/**
 * Tool: get_coa
 * Looks up a Certificate of Analysis and sends it via WhatsApp
 */
export async function handleGetCOA(
    args: { batch_number?: string; product_name?: string },
    context: ToolCallContext
): Promise<ToolResult> {
    const { batch_number, product_name } = args;
    const { customerPhone, conversationId } = context;

    try {
        console.log(`[VapiTools] Looking up COA: batch=${batch_number}, product=${product_name}`);

        // Search for COA in database
        let query = supabase.from('coas').select('*');

        if (batch_number) {
            query = query.ilike('batch_number', `%${batch_number}%`);
        }
        if (product_name) {
            query = query.ilike('product_name', `%${product_name}%`);
        }

        const { data: coas } = await query.limit(1).maybeSingle();

        if (!coas) {
            return {
                success: false,
                message: 'No encontré el COA. ¿Puedes darme el número de lote o nombre exacto del producto?'
            };
        }

        // If we have customer phone, send it
        if (customerPhone && coas.pdf_url) {
            const message = `📄 Aquí está el COA del producto ${coas.product_name}:\n${coas.pdf_url}`;

            await sendWhatsAppMessage({
                to: customerPhone,
                body: message
            });

            // Log in CRM
            if (conversationId) {
                await supabase.from('crm_messages').insert({
                    conversation_id: conversationId,
                    direction: 'outbound',
                    role: 'assistant',
                    message_type: 'file',
                    content: message,
                    status: 'sent',
                    raw_payload: { source: 'vapi_tool_call', coa_id: coas.id }
                });
            }

            return {
                success: true,
                message: `Encontré el COA del lote ${coas.batch_number} para ${coas.product_name}. Ya te lo envié por WhatsApp.`,
                data: {
                    batch_number: coas.batch_number,
                    product_name: coas.product_name,
                    pdf_url: coas.pdf_url
                }
            };
        }

        return {
            success: true,
            message: `Encontré el COA del lote ${coas.batch_number}. ¿Te lo envío por WhatsApp?`,
            data: {
                batch_number: coas.batch_number,
                product_name: coas.product_name
            }
        };

    } catch (error: any) {
        console.error('[VapiTools] get_coa error:', error.message);
        return { success: false, error: error.message };
    }
}

/**
 * Tool: lookup_order
 * Looks up order status by order number or gets the latest order for the customer
 */
export async function handleLookupOrder(
    args: { order_number?: string },
    context: ToolCallContext
): Promise<ToolResult> {
    const { order_number } = args;
    const { clientId, customerPhone } = context;

    try {
        let order;

        if (order_number) {
            // Search by order number
            const { data } = await supabase
                .from('orders')
                .select('*')
                .ilike('order_number', `%${order_number}%`)
                .limit(1)
                .maybeSingle();
            order = data;
        } else if (clientId) {
            // Get latest order for client
            const { data } = await supabase
                .from('orders')
                .select('*')
                .eq('client_id', clientId)
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle();
            order = data;
        } else if (customerPhone) {
            // Try to find client by phone first
            const cleanPhone = cleanupPhone(customerPhone);
            const { data: client } = await supabase
                .from('clients')
                .select('id')
                .ilike('phone', `%${cleanPhone}%`)
                .limit(1)
                .maybeSingle();

            if (client) {
                const { data } = await supabase
                    .from('orders')
                    .select('*')
                    .eq('client_id', client.id)
                    .order('created_at', { ascending: false })
                    .limit(1)
                    .maybeSingle();
                order = data;
            }
        }

        if (!order) {
            return {
                success: false,
                message: 'No encontré el pedido. ¿Tienes el número de orden? Empieza con EUM o un número.'
            };
        }

        // Format status in Spanish
        const statusMap: Record<string, string> = {
            'pending': 'Pendiente de pago',
            'paid': 'Pagado, preparando',
            'processing': 'En preparación',
            'shipped': 'Enviado',
            'in_transit': 'En camino',
            'delivered': 'Entregado',
            'cancelled': 'Cancelado'
        };

        const statusText = statusMap[order.status] || order.status;

        return {
            success: true,
            message: `El pedido #${order.order_number} está: ${statusText}. Total: $${order.total} MXN.`,
            data: {
                order_number: order.order_number,
                status: order.status,
                status_text: statusText,
                total: order.total,
                created_at: order.created_at,
                tracking_number: order.tracking_number,
                estimated_delivery: order.estimated_delivery
            }
        };

    } catch (error: any) {
        console.error('[VapiTools] lookup_order error:', error.message);
        return { success: false, error: error.message };
    }
}

/**
 * Tool: create_coupon
 * Creates a discount coupon for the customer
 */
export async function handleCreateCoupon(
    args: { discount_percent: number; reason: string },
    context: ToolCallContext
): Promise<ToolResult> {
    const { discount_percent, reason } = args;
    const { clientId, conversationId, customerPhone } = context;

    // Validate discount range
    if (discount_percent < 5 || discount_percent > 30) {
        return {
            success: false,
            error: 'El descuento debe ser entre 5% y 30%'
        };
    }

    try {
        // Generate unique coupon code
        const code = `ARA${discount_percent}-${Date.now().toString(36).toUpperCase()}`;

        // Create coupon in database
        const { data: coupon, error } = await supabase
            .from('coupons')
            .insert({
                code,
                discount_percent,
                reason,
                created_by: 'vapi_ara',
                client_id: clientId,
                conversation_id: conversationId,
                expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days
                max_uses: 1,
                is_active: true
            })
            .select()
            .single();

        if (error) {
            console.error('[VapiTools] Coupon creation error:', error);
            return { success: false, error: 'Error creando el cupón' };
        }

        // Send via WhatsApp if we have phone
        if (customerPhone) {
            const message = `🎁 Te creé un cupón especial del ${discount_percent}% de descuento:\n\n*${code}*\n\nVálido por 30 días en extractoseum.com`;

            await sendWhatsAppMessage({
                to: customerPhone,
                body: message
            });

            // Log in CRM
            if (conversationId) {
                await supabase.from('crm_messages').insert({
                    conversation_id: conversationId,
                    direction: 'outbound',
                    role: 'assistant',
                    message_type: 'text',
                    content: message,
                    status: 'sent',
                    raw_payload: { source: 'vapi_tool_call', coupon_id: coupon.id }
                });
            }
        }

        return {
            success: true,
            message: `Creé el cupón ${code} con ${discount_percent}% de descuento. ${customerPhone ? 'Ya te lo envié por WhatsApp.' : ''}`,
            data: {
                code,
                discount_percent,
                expires_at: coupon.expires_at
            }
        };

    } catch (error: any) {
        console.error('[VapiTools] create_coupon error:', error.message);
        return { success: false, error: error.message };
    }
}

/**
 * Tool: escalate_to_human
 * Registers request for human attention (does NOT transfer the call)
 */
export async function handleEscalateToHuman(
    args: { reason: string; wants_callback?: boolean },
    context: ToolCallContext
): Promise<ToolResult> {
    const { reason, wants_callback } = args;
    const { conversationId, clientId, customerPhone } = context;

    try {
        console.log(`[VapiTools] Escalation requested: ${reason}, callback: ${wants_callback}`);

        // Create escalation record / internal note
        if (conversationId) {
            // Add internal note about escalation
            await supabase.from('crm_messages').insert({
                conversation_id: conversationId,
                direction: 'inbound',
                role: 'system',
                message_type: 'internal_note',
                is_internal: true,
                content: `🚨 **Solicitud de Escalación (Llamada)**\n\nRazón: ${reason}\nCallback solicitado: ${wants_callback ? 'Sí' : 'No'}\nTeléfono: ${customerPhone || 'N/A'}`,
                status: 'delivered'
            });

            // Update conversation tags/status for visibility
            await supabase
                .from('conversations')
                .update({
                    tags: supabase.sql`array_append(tags, 'Callback Pendiente')`,
                    facts: supabase.sql`jsonb_set(COALESCE(facts, '{}'::jsonb), '{escalation_reason}', '"${reason}"'::jsonb)`
                })
                .eq('id', conversationId);
        }

        // TODO: Send notification to admin dashboard / OneSignal

        if (wants_callback) {
            return {
                success: true,
                message: 'Registré tu solicitud. Un supervisor te contactará en el siguiente horario disponible.',
                data: { callback_scheduled: true, reason }
            };
        }

        return {
            success: true,
            message: 'Entendido, tomé nota de tu solicitud. ¿Hay algo más en lo que pueda ayudarte mientras tanto?',
            data: { escalated: true, reason }
        };

    } catch (error: any) {
        console.error('[VapiTools] escalate_to_human error:', error.message);
        return { success: false, error: error.message };
    }
}

/**
 * Tool: get_client_info
 * Returns information about the current customer
 */
export async function handleGetClientInfo(
    args: {},
    context: ToolCallContext
): Promise<ToolResult> {
    const { clientId, customerPhone } = context;

    try {
        let client;

        if (clientId) {
            const { data } = await supabase
                .from('clients')
                .select('*')
                .eq('id', clientId)
                .single();
            client = data;
        } else if (customerPhone) {
            const cleanPhone = cleanupPhone(customerPhone);
            const { data } = await supabase
                .from('clients')
                .select('*')
                .ilike('phone', `%${cleanPhone}%`)
                .limit(1)
                .maybeSingle();
            client = data;
        }

        if (!client) {
            return {
                success: false,
                message: 'No encontré información del cliente en el sistema.'
            };
        }

        // Get order stats
        const { data: orders } = await supabase
            .from('orders')
            .select('id, total, status')
            .eq('client_id', client.id);

        const totalOrders = orders?.length || 0;
        const ltv = orders?.reduce((sum, o) => sum + (o.total || 0), 0) || 0;

        return {
            success: true,
            data: {
                name: client.name,
                email: client.email,
                phone: client.phone,
                total_orders: totalOrders,
                ltv: Math.round(ltv),
                created_at: client.created_at
            }
        };

    } catch (error: any) {
        console.error('[VapiTools] get_client_info error:', error.message);
        return { success: false, error: error.message };
    }
}

/**
 * Main tool router - dispatches tool calls to appropriate handlers
 */
export async function handleToolCall(
    toolName: string,
    args: any,
    context: ToolCallContext
): Promise<ToolResult> {
    console.log(`[VapiTools] Handling tool: ${toolName}`, args);

    switch (toolName) {
        case 'send_whatsapp':
        case 'function_tool_wa': // Legacy name from n8n
            return handleSendWhatsApp(args, context);

        case 'get_coa':
        case 'get_coa_and_send':
            return handleGetCOA(args, context);

        case 'lookup_order':
            return handleLookupOrder(args, context);

        case 'create_coupon':
            return handleCreateCoupon(args, context);

        case 'escalate_to_human':
            return handleEscalateToHuman(args, context);

        case 'get_client_info':
        case 'lookup_client':
            return handleGetClientInfo(args, context);

        default:
            console.warn(`[VapiTools] Unknown tool: ${toolName}`);
            return {
                success: false,
                error: `Herramienta desconocida: ${toolName}`
            };
    }
}
