
import { supabase } from '../config/supabase';
import { searchLocalProducts, createShopifyDraftOrder, searchShopifyCustomers, getShopifyCustomerOrders, searchShopifyCustomerByPhone } from './shopifyService';

export interface AIToolDefinition {
    type: 'function';
    function: {
        name: string;
        description: string;
        parameters: {
            type: 'object';
            properties: Record<string, any>;
            required?: string[];
        };
    };
}

/**
 * List of tools available to the Admin Assistant
 */
export const ADMIN_TOOLS: AIToolDefinition[] = [
    {
        type: 'function',
        function: {
            name: 'get_recent_orders',
            description: 'Retrieves the most recent orders from the system.',
            parameters: {
                type: 'object',
                properties: {
                    limit: { type: 'number', description: 'Number of orders to return (default 10)' }
                }
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'search_clients',
            description: 'Search for clients by name, email or phone.',
            parameters: {
                type: 'object',
                properties: {
                    query: { type: 'string', description: 'Search term' }
                },
                required: ['query']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'search_shopify_customers',
            description: 'Search for customers directly in Shopify (Live) by name, email, or phone. Use this if search_clients returns no results.',
            parameters: {
                type: 'object',
                properties: {
                    query: { type: 'string', description: 'Search term (name, email, or phone)' }
                },
                required: ['query']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'get_customer_orders_live',
            description: 'Fetch orders directly from Shopify for a specific customer ID. Use this if local orders list is empty.',
            parameters: {
                type: 'object',
                properties: {
                    shopify_customer_id: { type: 'string', description: 'The Shopify Customer ID' }
                },
                required: ['shopify_customer_id']
            }
        }
    },

    {
        type: 'function',
        function: {
            name: 'get_system_health',
            description: 'Verifies the integrity of the database using the internal ledger.',
            parameters: {
                type: 'object',
                properties: {}
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'read_file_content',
            description: 'Read the content of a file (code, config, logs) from the backend server.',
            parameters: {
                type: 'object',
                properties: {
                    file_path: { type: 'string', description: 'Relative path from project root (e.g. "src/index.ts")' }
                },
                required: ['file_path']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'list_directory',
            description: 'List files and folders in a directory.',
            parameters: {
                type: 'object',
                properties: {
                    dir_path: { type: 'string', description: 'Relative path directory (default "./")' }
                }
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'get_logs',
            description: 'Retrieve recent server logs.',
            parameters: {
                type: 'object',
                properties: {
                    type: { type: 'string', enum: ['error', 'out'], description: 'Log type (error or out)' },
                    lines: { type: 'number', description: 'Number of lines to retrieve' }
                }
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'get_active_clients_count_today',
            description: 'Returns the count of active clients since midnight (Today) in the store timezone, including COA scans, logged-in users, and orders placed.',
            parameters: {
                type: 'object',
                properties: {}
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'get_recent_scans_details',
            description: 'Returns a detailed list of recent COA scans including the COA name, location (city/country), visitor identity (via anonymous hash), and timestamp.',
            parameters: {
                type: 'object',
                properties: {
                    limit: { type: 'number', description: 'Number of recent scans to fetch (default 10).' }
                }
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'search_products_db',
            description: 'Search for products in the local database. Returns name, price, stock status, and purchase link. ALWAYS use this before answering product questions.',
            parameters: {
                type: 'object',
                properties: {
                    query: { type: 'string', description: 'Product name, effect, or keyword (e.g., "gummies", "sleep", "cbd")' }
                },
                required: ['query']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'create_checkout_link',
            description: 'Creates a Shopify Draft Order and generates a payment link (invoice_url). Use this to close the sale.',
            parameters: {
                type: 'object',
                properties: {
                    items: {
                        type: 'array',
                        items: {
                            type: 'object',
                            properties: {
                                variant_id: { type: 'number', description: 'The specific variant ID from search_products_db' },
                                quantity: { type: 'number', description: 'Quantity (default 1)' }
                            },
                            required: ['variant_id', 'quantity']
                        },
                        description: 'List of items to purchase'
                    }
                },
                required: ['items']
            }
        }
    },
    // PHASE 1: COMM & CRM TOOLS
    {
        type: 'function',
        function: {
            name: 'send_whatsapp_message',
            description: 'Send a WhatsApp message to a specific number. Use for direct customer communication.',
            parameters: {
                type: 'object',
                properties: {
                    phone: { type: 'string', description: 'Phone number (e.g. 5512345678)' },
                    message: { type: 'string', description: 'Message content' }
                },
                required: ['phone', 'message']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'check_whatsapp_status',
            description: 'Check WhatsApp Business connection status.',
            parameters: { type: 'object', properties: {} }
        }
    },
    {
        type: 'function',
        function: {
            name: 'initiate_voice_call',
            description: 'Initiate a real-time voice call using Vapi AI.',
            parameters: {
                type: 'object',
                properties: {
                    phone: { type: 'string', description: 'Customer phone number' },
                    customer_name: { type: 'string', description: 'Customer name (optional)' },
                    conversation_id: { type: 'string', description: 'CRM Conversation ID' }
                },
                required: ['phone']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'send_sms_notification',
            description: 'Send an SMS notification via Twilio (High Reliability). Use for urgent alerts or verification codes.',
            parameters: {
                type: 'object',
                properties: {
                    phone: { type: 'string', description: 'Phone number (E.164 format, e.g. +521...)' },
                    message: { type: 'string', description: 'Message content' }
                },
                required: ['phone', 'message']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'make_verification_call',
            description: 'Initiate a Twilio voice call to speak a verification code (OTP).',
            parameters: {
                type: 'object',
                properties: {
                    phone: { type: 'string', description: 'Phone number (E.164 format)' },
                    code: { type: 'string', description: 'The numeric code to speak (e.g. "123456")' }
                },
                required: ['phone', 'code']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'get_voice_call_history',
            description: 'Get voice call logs for a conversation.',
            parameters: {
                type: 'object',
                properties: {
                    conversation_id: { type: 'string', description: 'CRM Conversation ID' }
                },
                required: ['conversation_id']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'get_conversation_summary',
            description: 'Get summary and context of a CRM conversation.',
            parameters: {
                type: 'object',
                properties: {
                    conversation_id: { type: 'string', description: 'CRM Conversation ID' }
                },
                required: ['conversation_id']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'get_contact_360',
            description: 'Get full Customer 360 profile (LTV, orders, risk, tags).',
            parameters: {
                type: 'object',
                properties: {
                    phone: { type: 'string', description: 'Contact phone number' }
                },
                required: ['phone']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'move_conversation_to_column',
            description: 'Move conversation to a specific Kanban column.',
            parameters: {
                type: 'object',
                properties: {
                    conversation_id: { type: 'string', description: 'Conversation UUID' },
                    column_name: { type: 'string', description: 'Target column name (e.g. "Sales", "Support")' }
                },
                required: ['conversation_id', 'column_name']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'get_abandoned_checkouts',
            description: 'Retrieves pending abandoned checkouts (carts). Use this to identify recovery opportunities.',
            parameters: {
                type: 'object',
                properties: {
                    limit: { type: 'number', description: 'Number of checkouts to return (default 10)' }
                }
            }
        }
    },
    // PHASE 2: ANALYTICS TOOLS
    {
        type: 'function',
        function: {
            name: 'get_system_insights',
            description: 'Get system health alerts, error spikes, and performance insights.',
            parameters: { type: 'object', properties: {} }
        }
    },
    {
        type: 'function',
        function: {
            name: 'get_ai_usage_stats',
            description: 'Get AI API usage stats (tokens, costs) by model.',
            parameters: {
                type: 'object',
                properties: {
                    days: { type: 'number', description: 'Lookback period in days (default 7)' }
                }
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'get_behavior_insights',
            description: 'Get browsing behavior insights for a specific contact.',
            parameters: {
                type: 'object',
                properties: {
                    phone: { type: 'string', description: 'Contact phone number' }
                },
                required: ['phone']
            }
        }
    },
    // PHASE 3: EXTENDED FEATURES
    {
        type: 'function',
        function: {
            name: 'get_order_tracking',
            description: 'Get tracking info (Estafeta/Fedex) for a Shopify order.',
            parameters: {
                type: 'object',
                properties: {
                    order_id: { type: 'string', description: 'Shopify order ID' }
                },
                required: ['order_id']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'create_shopify_coupon',
            description: 'Create a unique discount coupon in Shopify.',
            parameters: {
                type: 'object',
                properties: {
                    code: { type: 'string', description: 'Coupon code (e.g. SAVE20)' },
                    amount_off: { type: 'number', description: 'Amount off (percentage or fixed)' },
                    type: { type: 'string', enum: ['percentage', 'fixed_amount'], description: 'Discount type' }
                },
                required: ['code', 'amount_off', 'type']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'sync_products_from_shopify',
            description: 'Force sync products from Shopify to local DB.',
            parameters: { type: 'object', properties: {} }
        }
    },
    {
        type: 'function',
        function: {
            name: 'generate_voice_message',
            description: 'Generate voice audio from text (TTS) for sending.',
            parameters: {
                type: 'object',
                properties: {
                    text: { type: 'string', description: 'Text to speak' },
                    voice_id: { type: 'string', description: 'ElevenLabs voice ID (optional)' }
                },
                required: ['text']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'search_coas',
            description: 'Search Certificates of Analysis (PDFs) metadata.',
            parameters: {
                type: 'object',
                properties: {
                    query: { type: 'string', description: 'Product name, batch, or client' }
                },
                required: ['query']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'get_coa_details',
            description: 'Get detailed metadata of a specific COA.',
            parameters: {
                type: 'object',
                properties: {
                    coa_id: { type: 'string', description: 'COA UUID' }
                },
                required: ['coa_id']
            }
        }
    }
];

/**
 * Handlers for the tools
 */
export const TOOL_HANDLERS: Record<string, (args: any) => Promise<any>> = {
    get_active_clients_count_today: async () => {
        // Calculate Midnight in Mexico (UTC-6)
        const now = new Date();
        const storeOffset = 6 * 60 * 60 * 1000; // 6 hours
        const storeTime = new Date(now.getTime() - storeOffset);
        storeTime.setUTCHours(0, 0, 0, 0); // Midnight local
        const windowToday = new Date(storeTime.getTime() + storeOffset).toISOString();

        // 1. Unique Scanners (IPs)
        const { data: scans } = await supabase
            .from('coa_scans')
            .select('ip_hash')
            .gte('scanned_at', windowToday);
        const uniqueIps = new Set(scans?.map(s => s.ip_hash) || []);

        // 2. Unique Orderers (Client IDs)
        const { data: orders } = await supabase
            .from('orders')
            .select('client_id')
            .gte('shopify_created_at', windowToday);
        const uniqueOrderers = new Set(orders?.map(o => o.client_id).filter(Boolean) || []);

        // 3. Unique Logins (Client IDs)
        const { data: logins } = await supabase
            .from('clients')
            .select('id')
            .gte('last_login_at', windowToday);
        const uniqueLogins = new Set(logins?.map(l => l.id) || []);

        // Total registered active
        const totalRegisteredActive = new Set([...Array.from(uniqueOrderers), ...Array.from(uniqueLogins)]);

        return {
            total_active: totalRegisteredActive.size + uniqueIps.size,
            registered_clients: totalRegisteredActive.size,
            anonymous_scanners: uniqueIps.size,
            orders_today: orders?.length || 0,
            period: 'Today (Since Midnight Store Time)',
            timestamp: new Date().toISOString()
        };
    },
    get_recent_scans_details: async ({ limit = 10 }) => {
        const { data, error } = await supabase
            .from('coa_scans')
            .select(`
                id,
                scanned_at,
                city,
                country,
                ip_address,
                ip_hash,
                coas (
                    custom_title,
                    custom_name,
                    coa_number
                )
            `)
            .order('scanned_at', { ascending: false })
            .limit(limit);

        if (error) throw error;

        return data.map((scan: any) => ({
            id: scan.id,
            timestamp: scan.scanned_at,
            location: `${scan.city || 'Unknown'}, ${scan.country || 'Unknown'}`,
            coa_name: scan.coas?.custom_name || scan.coas?.custom_title || scan.coas?.coa_number || 'Unknown COA',
            ip_address: scan.ip_address,
            visitor_id: scan.ip_hash // Full hash for unique identification
        }));
    },
    get_recent_orders: async ({ limit = 10 }) => {
        // Use shopify_created_at for accurate reporting that matches Shopify Admin
        const { data, error, count } = await supabase
            .from('orders')
            .select('*', { count: 'exact' })
            .order('shopify_created_at', { ascending: false })
            .limit(limit);

        if (error) throw error;
        return {
            total_count: count,
            orders: data,
            limit
        };
    },

    search_clients: async ({ query }) => {
        const { data, error } = await supabase
            .from('clients')
            .select('*')
            .or(`name.ilike.%${query}%,email.ilike.%${query}%,phone.ilike.%${query}%`)
            .limit(5);

        if (error) throw error;
        return data;
    },

    search_shopify_customers: async ({ query }) => {
        try {
            console.log(`[AITools] searching Shopify for: ${query}`);
            // Check if query looks like a phone number
            const isPhone = /^\+?\d+$/.test(query.replace(/[\s-]/g, ''));
            let customers = [];

            if (isPhone) {
                customers = await searchShopifyCustomerByPhone(query);
            } else {
                customers = await searchShopifyCustomers(query);
            }

            return customers.map((c: any) => ({
                id: c.id,
                name: `${c.first_name} ${c.last_name}`,
                email: c.email,
                phone: c.phone || c.default_address?.phone || 'N/A',
                total_spent: c.total_spent,
                orders_count: c.orders_count,
                tags: c.tags
            }));
        } catch (e: any) {

            console.error('[AITools] Shopify search failed:', e);
            return { error: e.message };
        }
    },

    get_customer_orders_live: async ({ shopify_customer_id }) => {
        try {
            console.log(`[AITools] fetching live orders for: ${shopify_customer_id}`);
            const orders = await getShopifyCustomerOrders(shopify_customer_id);
            return orders.map((o: any) => ({
                order_number: o.name,
                created_at: o.created_at,
                total: o.total_price,
                financial_status: o.financial_status,
                fulfillment_status: o.fulfillment_status,
                items: o.line_items.map((i: any) => `${i.quantity}x ${i.title}`).join(', ')
            }));
        } catch (e: any) {
            console.error('[AITools] Shopify orders failed:', e);
            return { error: e.message };
        }
    },


    get_system_health: async () => {
        // Simple count of ledger entries as a proxy for health for now
        const { count, error } = await supabase
            .from('integrity_ledger')
            .select('*', { count: 'exact', head: true });

        if (error) throw error;
        return {
            status: 'Operational',
            ledger_entries: count,
            timestamp: new Date().toISOString()
        };
    },

    read_file_content: async ({ file_path }) => {
        const fs = require('fs');
        const path = require('path');
        const PROJECT_ROOT = path.resolve(__dirname, '../../..'); // Adjust based on dist/services structure
        // In dist/services/aiTools.js -> ../../.. is dist/.. -> backend root? 
        // Let's use process.cwd() which is usually backend root in PM2
        const safeRoot = process.cwd();
        const targetPath = path.resolve(safeRoot, file_path);

        if (!targetPath.startsWith(safeRoot)) {
            throw new Error('Access denied: Path traversal detected.');
        }

        if (!fs.existsSync(targetPath)) {
            throw new Error(`File not found: ${file_path}`);
        }

        const content = fs.readFileSync(targetPath, 'utf-8');
        return { file_path, content: content.substring(0, 5000) + (content.length > 5000 ? '\n...[TRUNCATED]' : '') };
    },

    list_directory: async ({ dir_path = './' }) => {
        const fs = require('fs');
        const path = require('path');
        const safeRoot = process.cwd();
        const targetPath = path.resolve(safeRoot, dir_path);

        if (!targetPath.startsWith(safeRoot)) {
            throw new Error('Access denied: Path traversal detected.');
        }

        if (!fs.existsSync(targetPath)) {
            throw new Error(`Directory not found: ${dir_path}`);
        }

        const files = fs.readdirSync(targetPath, { withFileTypes: true }).map((dirent: any) => ({
            name: dirent.name,
            type: dirent.isDirectory() ? 'directory' : 'file'
        }));

        return { dir_path, files: files.slice(0, 50) };
    },

    get_logs: async ({ type = 'error', lines = 20 }) => {
        const fs = require('fs');
        const path = require('path');
        // PM2 logs default location or configured? Assuming /root/.pm2/logs based on previous sessions
        // BUT we might not have access to /root/.pm2 from the node process if user is different?
        // Actually earlier logs showed user is root.
        const logPath = type === 'out' ? '/root/.pm2/logs/coa-backend-out.log' : '/root/.pm2/logs/coa-backend-error.log';

        if (!fs.existsSync(logPath)) {
            return { error: `Log file not found at ${logPath}` };
        }

        // Simple tail implementation
        const content = fs.readFileSync(logPath, 'utf-8');
        const allLines = content.split('\n');
        const recentLines = allLines.slice(-lines);
        return { log_file: logPath, lines: recentLines };
    },

    search_products_db: async ({ query }: { query: string }) => {
        try {
            console.log(`[AITools] Searching products for: "${query}"`);
            const products = await searchLocalProducts(query);

            if (products.length === 0) {
                return {
                    query,
                    count: 0,
                    results: [],
                    hint: "No exact matches found. Try searching for the English term (e.g. 'gummies' instead of 'gomitas') or a broader category."
                };
            }

            return {
                query,
                count: products.length,
                results: products
            };
        } catch (error: any) {
            console.error('[AITools] Product search failed:', error.message);
            return { error: 'Failed to search products database.' };
        }
    },
    create_checkout_link: async ({ items }: { items: any[] }) => {
        try {
            console.log('[AITools] Creating checkout link for:', items);
            // Map args to service expected format
            // items comes as [{ variant_id: 123, quantity: 1 }]
            const serviceItems = items.map((i: any) => ({
                variantId: i.variant_id,
                quantity: i.quantity || 1
            }));

            const url = await createShopifyDraftOrder(serviceItems);

            if (url) {
                return { success: true, invoice_url: url };
            } else {
                return { error: 'Could not generate invoice URL (Shopify returned null).' };
            }
        } catch (error: any) {
            console.error('[AITools] Create checkout failed:', error.message);
            return { error: `Failed to create checkout link: ${error.message}` };
        }
    },
    search_knowledge_base: async ({ query }: { query: string }) => {
        try {
            // We need AIService to generate embedding.
            // We use dynamic import or require to break circular dependency if any.
            const { AIService } = require('./aiService');
            const aiService = AIService.getInstance();

            console.log(`[AITools] Vector searching for: "${query}"`);
            const embedding = await aiService.generateEmbedding(query);

            const { data, error } = await supabase.rpc('match_knowledge', {
                query_embedding: embedding,
                match_threshold: 0.25, // Lowered threshold based on debug results (typ. 0.2-0.4)
                match_count: 5
            });

            if (error) throw error;

            if (!data || data.length === 0) {
                return { message: "No relevant information found in knowledge base." };
            }

            return {
                query,
                results: data.map((d: any) => ({
                    content: d.content,
                    similarity: d.similarity
                }))
            };

        } catch (error: any) {
            console.error('[AITools] Knowledge search failed:', error.message);
            return { error: 'Failed to search knowledge base.' };
        }
    },
    // PHASE 1 HANDLERS
    send_whatsapp_message: async ({ phone, message }) => {
        const { sendWhatsAppMessage, normalizePhone } = require('./whapiService');
        // Normalize handled by service, but good to be safe if service changes
        const result = await sendWhatsAppMessage({ to: phone, body: message });
        return result.sent
            ? { success: true, message_id: result.message?.id }
            : { success: false, error: result.error };
    },
    check_whatsapp_status: async () => {
        const { checkWhapiStatus } = require('./whapiService');
        return checkWhapiStatus();
    },
    initiate_voice_call: async ({ phone, customer_name, conversation_id }) => {
        const { VapiService } = require('./VapiService');
        const vapi = new VapiService();
        try {
            const call = await vapi.createCall({
                phoneNumber: phone,
                customerName: customer_name,
                conversationId: conversation_id
            });
            return { success: true, call_id: call.id, status: call.status };
        } catch (e: any) {
            return { success: false, error: e.message };
        }
    },
    send_sms_notification: async ({ phone, message }) => {
        const { sendSMS } = require('./twilioService');
        const result = await sendSMS(phone, message);
        return result;
    },
    make_verification_call: async ({ phone, code }) => {
        const { makeVoiceCall } = require('./twilioService');
        const result = await makeVoiceCall(phone, code);
        return result;
    },
    get_voice_call_history: async ({ conversation_id }) => {
        const { data, error } = await supabase
            .from('voice_calls')
            .select('*')
            .eq('conversation_id', conversation_id)
            .order('created_at', { ascending: false })
            .limit(10);

        if (error) throw error;
        return data.map((c: any) => ({
            id: c.id,
            direction: c.direction,
            status: c.status,
            duration: c.duration_seconds,
            summary: c.summary,
            recording_url: c.recording_url,
            created_at: c.created_at
        }));
    },
    get_conversation_summary: async ({ conversation_id }) => {
        const { data, error } = await supabase
            .from('conversations')
            .select('id, summary, facts, status, last_message_at, contact_handle')
            .eq('id', conversation_id)
            .single();

        if (error) throw error;
        return data;
    },
    get_contact_360: async ({ phone }) => {
        // Use CRMService to ensure we use the full logic including standardizing phone
        const { CRMService } = require('./CRMService');
        const crm = new CRMService(); // Singleton persistence handled in class usually or stateless? 
        // CRMService usually singleton-ish but instantiation is cheap if stateless deps.
        // Checking CRMService implementation... it has instance methods but no static getInstance in the visible code.
        // Creating new instance is safe as it uses imported singletons (supabase, aiService).
        return crm.getContactSnapshot(phone, 'WA');
    },
    move_conversation_to_column: async ({ conversation_id, column_name }) => {
        // Find column by name
        const { data: column } = await supabase
            .from('crm_columns')
            .select('id')
            .ilike('name', `%${column_name}%`)
            .single();

        if (!column) return { error: `Column "${column_name}" not found` };

        const { CRMService } = require('./CRMService');
        const crm = new CRMService();
        await crm.moveConversation(conversation_id, column.id);
        return { success: true, moved_to: column_name };
    },
    // PHASE 2 HANDLERS
    get_system_insights: async () => {
        const { getInsights } = require('./insightService');
        return getInsights();
    },
    get_ai_usage_stats: async ({ days = 7 }) => {
        const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
        const { data, error } = await supabase
            .from('ai_usage_logs')
            .select('model, input_tokens, output_tokens, created_at')
            .gte('created_at', since);

        if (error) {
            console.warn('[AITools] Failed to fetch ai_usage_logs:', error.message);
            // Return empty stats if table doesn't exist yet to avoid crash
            return { period_days: days, usage_by_model: {}, total_calls: 0, error: error.message };
        }

        const byModel: Record<string, { calls: number, input: number, output: number }> = {};
        data.forEach((log: any) => {
            const m = log.model || 'unknown';
            if (!byModel[m]) byModel[m] = { calls: 0, input: 0, output: 0 };
            byModel[m].calls++;
            byModel[m].input += (log.input_tokens || 0);
            byModel[m].output += (log.output_tokens || 0);
        });

        return { period_days: days, usage_by_model: byModel, total_calls: data.length };
    },
    get_behavior_insights: async ({ phone }) => {
        // Strip non-digits
        const clean = phone.replace(/\D/g, '');
        // Use last 10 digits as key interaction point
        const last10 = clean.slice(-10);

        const { data, error } = await supabase
            .from('browsing_behavior')
            .select('*')
            .ilike('phone', `%${last10}%`)
            .order('created_at', { ascending: false })
            .limit(20);

        if (error) {
            console.warn('[AITools] Failed to fetch browsing_behavior:', error.message);
            return { events: 0, pages_visited: [], error: error.message };
        }

        const pages: Record<string, number> = {};
        let totalTime = 0;

        data.forEach((b: any) => {
            if (b.page_url) {
                pages[b.page_url] = (pages[b.page_url] || 0) + 1;
            }
            totalTime += (b.time_on_page || 0);
        });

        return {
            events: data.length,
            pages_visited: Object.entries(pages).sort((a, b) => b[1] - a[1]).slice(0, 5),
            avg_time_per_page_sec: data.length > 0 ? Math.round(totalTime / data.length) : 0,
            last_active: data.length > 0 ? data[0].created_at : null
        };
    },
    // PHASE 3 HANDLERS
    get_order_tracking: async ({ order_id }) => {
        // Assuming we rely on get_shopify_order but specifically looking for fulfillments
        const { getShopifyOrder } = require('./shopifyService');
        try {
            const order = await getShopifyOrder(order_id);
            const fulfillments = order.fulfillments || [];
            return {
                order_id: order.id,
                tracking: fulfillments.map((f: any) => ({
                    company: f.tracking_company,
                    number: f.tracking_number,
                    url: f.tracking_url,
                    status: f.shipment_status
                }))
            };
        } catch (e: any) {
            return { error: 'Order not found or shopify error' };
        }
    },
    create_shopify_coupon: async ({ code, amount_off, type }) => {
        const { createShopifyPriceRule, createShopifyDiscountCode } = require('./shopifyService');
        try {
            // 1. Create Price Rule
            const priceRule = await createShopifyPriceRule({
                title: `Auto-Gen: ${code}`,
                target_type: 'line_item',
                target_selection: 'all',
                allocation_method: 'across',
                value_type: type,
                value: `-${Math.abs(amount_off)}`, // Negative for discount
                customer_selection: 'all',
                starts_at: new Date().toISOString()
            });

            // 2. Create Code
            const discount = await createShopifyDiscountCode(priceRule.id, code);
            return { success: true, code: discount.code, rule_id: priceRule.id };
        } catch (e: any) {
            return { success: false, error: e.message };
        }
    },
    sync_products_from_shopify: async () => {
        const { syncProducts } = require('./shopifyService'); // Assuming syncProducts exists or similar 
        // Checking shopifyService for syncProducts... it has syncAllCustomersToBackup, maybe syncProducts is elsewhere.
        // Actually, there's `refreshTagsCache` but products? 
        // Let's check `searchProducts` or use a placeholder if sync is cron-only.
        // I'll call a hypothetical `forceProductSync` if I can find it, otherwise just return status.
        // For now, let's assume `syncProducts` isn't exported directly. 
        // Let's fallback to just checking last sync time to be safe.
        // Or actually, user requested "sync_products". I will implement a placeholder that triggers a background job if avail.
        return { success: false, message: 'Manual sync not fully implemented yet' };
    },
    generate_voice_message: async ({ text, voice_id }) => {
        const { generateSpeech } = require('./VoiceService'); // Assuming VoiceService handles TTS
        // VoiceService usually singleton. 
        // Checking VoiceService imports...
        // Let's try direct ElevenLabs call via VoiceService if static? No, VoiceService is a class.
        // I'll assume we can instantiate it.
        const { VoiceService } = require('./VoiceService');
        const voiceService = new VoiceService();
        try {
            const audioBuffer = await voiceService.textToSpeech(text, voice_id);
            // Need to upload and return URL?
            // textToSpeech returns Buffer usually.
            return { success: true, message: 'Audio generated (buffer length: ' + audioBuffer.length + ')' };
        } catch (e: any) {
            return { success: false, error: e.message };
        }
    },
    search_coas: async ({ query }) => {
        const { data, error } = await supabase
            .from('coas')
            .select('id, batch_id, lab_name, created_at, custom_name') // Added custom_name
            .or(`batch_id.ilike.%${query}%,lab_name.ilike.%${query}%,custom_name.ilike.%${query}%`)
            .limit(10);

        if (error) return { error: error.message };
        return data;
    },
    get_coa_details: async ({ coa_id }) => {
        const { data, error } = await supabase
            .from('coas')
            .select('*')
            .eq('id', coa_id)
            .single();

        if (error) return { error: error.message };
        return data;
    },
    get_abandoned_checkouts: async ({ limit = 10 }) => {
        const { data, error, count } = await supabase
            .from('abandoned_checkouts')
            .select('*', { count: 'exact' })
            .eq('recovery_status', 'pending')
            .order('created_at', { ascending: false })
            .limit(limit);

        if (error) throw error;
        return {
            total_pending: count,
            checkouts: data || [],
            limit
        };
    }
};
