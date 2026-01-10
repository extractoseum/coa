import { supabase } from '../config/supabase';
import { logger } from '../utils/Logger';
import {
    searchLocalProducts,
    searchShopifyProducts
} from './shopifyService';
// Note: shopifyService sometimes exports these, sometimes they are in utils. 
// Based on previous analysis, they are in ../utils/phoneUtils.
import { normalizePhone as normPhone, cleanupPhone as cleanPhone } from '../utils/phoneUtils';
import { sendSmartMessage } from './SmartCommunicationService';

export interface AuditStep {
    timestamp: string;
    type: 'tool_call' | 'knowledge_load' | 'decision';
    name: string;
    input: any;
    output: any;
    reason?: string;
}

export class AuditCollector {
    private steps: AuditStep[] = [];

    addStep(step: Omit<AuditStep, 'timestamp'>) {
        this.steps.push({
            ...step,
            timestamp: new Date().toISOString()
        });
    }

    getTrail() {
        return this.steps;
    }
}

export interface ToolContext {
    conversationId?: string;
    clientId?: string;
    customerPhone?: string;
    customerEmail?: string;
    agentId?: string;
    auditCollector?: AuditCollector;
}

/**
 * AgentToolService - Unified Tool Logic for all Agents (Voice, WhatsApp, Widget, CRM)
 * 
 * This service centralizes the "Truth Layer" for tool execution, ensuring 
 * consistency between different channels and preventing AI hallucinations.
 */
export class AgentToolService {
    private static instance: AgentToolService;
    private searchMappingsCache: Record<string, string[]> = {};
    private lastMappingsFetch: number = 0;
    private readonly MAPPINGS_CACHE_TTL = 60000;

    private constructor() { }

    public static getInstance(): AgentToolService {
        if (!AgentToolService.instance) {
            AgentToolService.instance = new AgentToolService();
        }
        return AgentToolService.instance;
    }

    /**
     * Get search mappings from database with caching
     */
    private async getSearchMappings(): Promise<Record<string, string[]>> {
        const now = Date.now();
        if (Object.keys(this.searchMappingsCache).length > 0 && (now - this.lastMappingsFetch) < this.MAPPINGS_CACHE_TTL) {
            return this.searchMappingsCache;
        }

        try {
            const { data, error } = await supabase
                .from('search_term_mappings')
                .select('search_term, mapped_terms')
                .eq('is_active', true)
                .gte('confidence_score', 0.30);

            if (error) throw error;

            const mappings: Record<string, string[]> = {};
            for (const row of data || []) {
                mappings[row.search_term.toLowerCase()] = row.mapped_terms;
            }

            this.searchMappingsCache = mappings;
            this.lastMappingsFetch = now;
            return mappings;
        } catch (e: any) {
            console.error('[AgentToolService] Error fetching search mappings:', e.message);
            return {};
        }
    }

    /**
     * Update mapping stats after a search
     */
    private async updateMappingStats(searchTerm: string, wasSuccessful: boolean): Promise<void> {
        try {
            const { data: mapping } = await supabase
                .from('search_term_mappings')
                .select('times_used, times_successful')
                .eq('search_term', searchTerm.toLowerCase())
                .eq('is_active', true)
                .single();

            if (mapping) {
                const newTimesUsed = (mapping.times_used || 0) + 1;
                const newTimesSuccessful = wasSuccessful ? (mapping.times_successful || 0) + 1 : (mapping.times_successful || 0);
                const newConfidence = newTimesSuccessful / newTimesUsed;

                await supabase
                    .from('search_term_mappings')
                    .update({
                        times_used: newTimesUsed,
                        times_successful: newTimesSuccessful,
                        confidence_score: Math.min(1.0, Math.max(0.1, newConfidence)),
                        last_used_at: new Date().toISOString(),
                        updated_at: new Date().toISOString()
                    })
                    .eq('search_term', searchTerm.toLowerCase())
                    .eq('is_active', true);
            }
        } catch (e) {
            // Non-critical
        }
    }

    /**
     * Search for products in the local database with advanced ranking
     */
    async searchProducts(query: string, context?: ToolContext) {
        try {
            logger.info(`[AgentToolService] Search products: "${query}"`);

            const searchMappings = await this.getSearchMappings();
            let products: any[] = [];
            const queryLower = (query || '').toLowerCase().trim();

            // 1. Priority: Literal search in Title
            const { data: literalResults } = await supabase
                .from('products')
                .select('id, title, handle, product_type, description_plain, variants, status')
                .eq('status', 'active')
                .ilike('title', `%${queryLower}%`)
                .limit(5);

            if (literalResults) products = [...literalResults];

            // 2. Term Expansion
            let expandedTerms: string[] = [queryLower];
            const queryWords = queryLower.split(/\s+/).filter(w => w.length > 2);
            for (const word of queryWords) {
                if (searchMappings[word]) {
                    expandedTerms.push(...searchMappings[word]);
                }
            }
            expandedTerms = [...new Set(expandedTerms)];

            // 3. Search by expanded terms
            for (const term of expandedTerms) {
                if (products.length >= 15) break;
                const { data: results } = await supabase
                    .from('products')
                    .select('id, title, handle, product_type, description_plain, variants, status')
                    .eq('status', 'active')
                    .or(`title.ilike.%${term}%,product_type.ilike.%${term}%,description_plain.ilike.%${term}%`)
                    .limit(10);
                if (results) {
                    const existingIds = new Set(products.map(p => p.id));
                    products = [...products, ...results.filter(p => !existingIds.has(p.id))];
                }
            }

            if (queryLower) {
                this.updateMappingStats(queryLower, products.length > 0).catch(() => { });
            }

            // 4. Hybrid Fallback: Search Shopify API directly if no local results
            let source = 'local_db';
            if (products.length === 0) {
                logger.info(`[AgentToolService] No local results for "${query}", falling back to Shopify API`);
                const apiResults = await searchShopifyProducts(query);
                if (apiResults.length > 0) {
                    products = apiResults;
                    source = 'shopify_api';
                }
            }

            const result = {
                query,
                count: products.length,
                results: products,
                source
            };

            if (context?.auditCollector) {
                context.auditCollector.addStep({
                    type: 'tool_call',
                    name: 'search_products',
                    input: { query },
                    output: result,
                    reason: source === 'shopify_api' ? 'Fallback to Shopify API due to no local results' : 'Found in local DB'
                });
            }

            return result;
        } catch (error: any) {
            logger.error('[AgentToolService] Product search failed:', error);
            throw error;
        }
    }

    /**
     * Look up order information by number or customer context
     */
    async lookupOrder(orderNumber?: string, context?: ToolContext) {
        try {
            logger.info(`[AgentToolService] Lookup order: ${orderNumber || 'context search'}`);
            let foundOrders: any[] = [];
            let lookupType = orderNumber ? 'specific_number' : 'context_search';

            if (orderNumber) {
                const cleanNumber = orderNumber.replace('#', '').trim();
                const { data: orders } = await supabase
                    .from('orders')
                    .select('*, order_tracking(*)')
                    .or(`order_number.ilike.%${cleanNumber}%,shopify_order_id.eq.${cleanNumber}`)
                    .order('created_at', { ascending: false });
                if (orders) foundOrders = orders;
            }

            if (foundOrders.length === 0) {
                const phone = context?.customerPhone ? cleanPhone(context.customerPhone) : null;
                const email = context?.customerEmail;
                if (phone || email) {
                    let query = supabase.from('orders').select('*, order_tracking(*)');
                    if (email) query = query.ilike('customer_email', email);
                    else if (phone) query = query.ilike('customer_phone', `%${phone}%`);
                    const { data: orders } = await query.order('shopify_created_at', { ascending: false }).limit(5);
                    if (orders) {
                        foundOrders = orders;
                        lookupType = 'customer_identity_match';
                    }
                }
            }

            const result = {
                found: foundOrders.length > 0,
                count: foundOrders.length,
                orders: foundOrders.map(o => ({
                    order_number: o.order_number,
                    total: String(o.total_amount || '0'),
                    status: o.status || o.financial_status || 'pending',
                    fulfillment_status: o.fulfillment_status || 'Procesando',
                    created_at: o.shopify_created_at,
                    tracking_number: o.order_tracking?.[0]?.tracking_number,
                    tracking_url: o.order_tracking?.[0]?.tracking_url,
                    carrier: o.order_tracking?.[0]?.carrier
                }))
            };

            if (context?.auditCollector) {
                context.auditCollector.addStep({
                    type: 'tool_call',
                    name: 'lookup_order',
                    input: { orderNumber, customerPhone: context.customerPhone, customerEmail: context.customerEmail },
                    output: result,
                    reason: `Lookup via ${lookupType}. Found ${foundOrders.length} orders.`
                });
            }

            return result;
        } catch (error: any) {
            logger.error('[AgentToolService] Order lookup failed:', error);
            throw error;
        }
    }

    /**
     * Get Certificate of Analysis (COA) for a product or batch
     */
    async getCOA(coaIdOrBatch?: string, productName?: string, context?: ToolContext) {
        try {
            let dbQuery = supabase.from('coas').select('*');
            let lookupMethod = 'none';
            if (coaIdOrBatch) {
                lookupMethod = 'id_or_batch';
                // Try as ID first, then as Batch
                dbQuery = dbQuery.or(`id.eq.${coaIdOrBatch},batch_id.ilike.%${coaIdOrBatch}%`);
            } else if (productName) {
                lookupMethod = 'product_name';
                dbQuery = dbQuery.ilike('custom_name', `%${productName}%`);
            }

            const { data: coas } = await dbQuery.limit(5);

            const result = {
                found: (coas?.length || 0) > 0,
                count: coas?.length || 0,
                results: (coas || []).map(c => ({
                    id: c.id,
                    batch: c.batch_id,
                    name: c.custom_name || c.custom_title,
                    link: `https://coa.extractoseum.com/coa/${c.id}`
                }))
            };

            if (context?.auditCollector) {
                context.auditCollector.addStep({
                    type: 'tool_call',
                    name: 'get_coa',
                    input: { coaIdOrBatch, productName },
                    output: result,
                    reason: `Lookup via ${lookupMethod}. Found ${coas?.length || 0} COAs.`
                });
            }

            return result;
        } catch (error: any) {
            logger.error('[AgentToolService] COA lookup failed:', error);
            throw error;
        }
    }

    /**
     * Send a smart message with fallback (WhatsApp -> SMS -> Email)
     */
    async sendWhatsApp(message: string, context: ToolContext) {
        try {
            const phone = context.customerPhone ? normPhone(context.customerPhone) : null;
            if (!phone) return { error: 'No phone number provided' };

            const result = await sendSmartMessage({
                to: phone,
                toEmail: context.customerEmail,
                subject: 'Información de tu llamada con Extractos EUM',
                body: message,
                type: 'informational',
                clientId: context.clientId,
                conversationId: context.conversationId
            });

            const finalResult = result.success
                ? { success: true, message: 'Message sent', channelUsed: result.channelUsed }
                : { error: result.error };

            if (context.auditCollector) {
                context.auditCollector.addStep({
                    type: 'tool_call',
                    name: 'send_whatsapp',
                    input: { message, phone, email: context.customerEmail },
                    output: finalResult,
                    reason: result.success ? `Successfully sent via ${result.channelUsed}` : `Failed: ${result.error}`
                });
            }

            return finalResult;
        } catch (error: any) {
            logger.error('[AgentToolService] Smart message failed:', error);
            throw error;
        }
    }

    /**
     * Get client 360 info
     */
    async getClientInfo(clientId?: string, phone?: string, context?: ToolContext) {
        try {
            let client;
            let lookupBy = 'none';
            if (clientId) {
                lookupBy = 'clientId';
                const { data } = await supabase.from('clients').select('*').eq('id', clientId).single();
                client = data;
            } else if (phone) {
                lookupBy = 'phone';
                const cp = cleanPhone(phone);
                const { data } = await supabase.from('clients').select('*').ilike('phone', `%${cp}%`).limit(1).maybeSingle();
                client = data;
            }

            if (!client) {
                const failResult = { found: false, message: 'Client not found' };
                if (context?.auditCollector) {
                    context.auditCollector.addStep({
                        type: 'tool_call',
                        name: 'get_client_info',
                        input: { clientId, phone },
                        output: failResult,
                        reason: `Client not found via ${lookupBy}`
                    });
                }
                return failResult;
            }

            const { data: orders } = await supabase
                .from('orders')
                .select('id, total_amount, status, created_at')
                .eq('client_id', client.id)
                .order('created_at', { ascending: false });

            const result = {
                found: true,
                client: {
                    name: client.name,
                    email: client.email,
                    phone: client.phone,
                    total_orders: orders?.length || 0,
                    ltv: orders?.reduce((sum, o) => sum + (o.total_amount || 0), 0) || 0,
                    last_order: orders?.[0]
                }
            };

            if (context?.auditCollector) {
                context.auditCollector.addStep({
                    type: 'tool_call',
                    name: 'get_client_info',
                    input: { clientId, phone },
                    output: result,
                    reason: `Found client via ${lookupBy}. LTV: ${result.client.ltv}`
                });
            }

            return result;
        } catch (error: any) {
            logger.error('[AgentToolService] Get client info failed:', error);
            throw error;
        }
    }

    /**
     * Create a discount coupon
     */
    async createCoupon(discountPercent: number, reason: string, context: ToolContext) {
        try {
            const code = `ARA${discountPercent}-${Date.now().toString(36).toUpperCase()}`;
            const { data: coupon, error } = await supabase
                .from('coupons')
                .insert({
                    code,
                    discount_percent: discountPercent,
                    reason,
                    created_by: 'sales_ara',
                    client_id: context.clientId,
                    conversation_id: context.conversationId,
                    expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
                    max_uses: 1,
                    is_active: true
                })
                .select()
                .single();

            if (error) throw error;
            const result = { success: true, code, discountPercent, expiresAt: coupon.expires_at };

            if (context.auditCollector) {
                context.auditCollector.addStep({
                    type: 'tool_call',
                    name: 'create_coupon',
                    input: { discountPercent, reason },
                    output: result,
                    reason: `Generated coupon ${code} for ${discountPercent}% off.`
                });
            }

            return result;
        } catch (error: any) {
            logger.error('[AgentToolService] Create coupon failed:', error);
            throw error;
        }
    }

    /**
     * Escalate to human
     */
    async escalateToHuman(reason: string, context: ToolContext) {
        try {
            if (context.conversationId) {
                await supabase.from('conversations').update({
                    status: 'review',
                    facts: {
                        ...(context as any).facts,
                        escalated_at: new Date().toISOString(),
                        escalation_reason: reason
                    }
                }).eq('id', context.conversationId);
            }
            const result = { success: true, message: 'Escalated to human' };

            if (context.auditCollector) {
                context.auditCollector.addStep({
                    type: 'tool_call',
                    name: 'escalate_to_human',
                    input: { reason },
                    output: result,
                    reason: `Escalation requested for: ${reason}`
                });
            }

            return result;
        } catch (error: any) {
            logger.error('[AgentToolService] Escalation failed:', error);
            throw error;
        }
    }

    /**
     * Audit a past decision by inspecting message metadata
     */
    async auditDecision(messageId: string) {
        try {
            const { data: message, error } = await supabase
                .from('crm_messages')
                .select('content, raw_payload')
                .eq('id', messageId)
                .single();

            if (error || !message) {
                return { error: 'Message not found or no audit data available' };
            }

            const auditTrail = (message.raw_payload as any)?.audit_trail;
            if (!auditTrail) {
                return {
                    message: message.content,
                    explanation: 'No detailed audit trail found for this message. It might have been generated before auditing was enabled.'
                };
            }

            return {
                message_content: message.content,
                audit_trail: auditTrail,
                explanation: 'This trace shows every tool call and knowledge piece the agent analyzed before generating the response.'
            };
        } catch (error: any) {
            logger.error('[AgentToolService] Audit decision failed:', error);
            throw error;
        }
    }
}
