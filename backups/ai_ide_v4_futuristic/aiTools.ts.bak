
import { supabase } from '../config/supabase';
import { searchLocalProducts, createShopifyDraftOrder } from './shopifyService';

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
            description: 'Returns the count of active clients in the last 24h, including COA scans, recent orders, and logged-in users.',
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
            name: 'restart_backend_service',
            description: 'Restarts the backend server process (PM2). Use with caution.',
            parameters: {
                type: 'object',
                properties: {}
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
    }
];

/**
 * Handlers for the tools
 */
export const TOOL_HANDLERS: Record<string, (args: any) => Promise<any>> = {
    get_active_clients_count_today: async () => {
        const window24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

        // 1. Unique Scanners (IPs)
        const { data: scans } = await supabase
            .from('coa_scans')
            .select('ip_hash')
            .gte('scanned_at', window24h);
        const uniqueIps = new Set(scans?.map(s => s.ip_hash) || []);

        // 2. Unique Orderers (Client IDs)
        const { data: orders } = await supabase
            .from('orders')
            .select('client_id')
            .gte('created_at', window24h);
        const uniqueOrderers = new Set(orders?.map(o => o.client_id).filter(Boolean) || []);

        // 3. Unique Logins (Client IDs)
        const { data: logins } = await supabase
            .from('clients')
            .select('id')
            .gte('last_login_at', window24h);
        const uniqueLogins = new Set(logins?.map(l => l.id) || []);

        // Total registered active
        const totalRegisteredActive = new Set([...Array.from(uniqueOrderers), ...Array.from(uniqueLogins)]);

        return {
            total_active: totalRegisteredActive.size + uniqueIps.size,
            registered_clients: totalRegisteredActive.size,
            anonymous_scanners: uniqueIps.size,
            orders_today: orders?.length || 0,
            period: 'Last 24 Hours',
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
        const { data, error } = await supabase
            .from('orders')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(limit);

        if (error) throw error;
        return data;
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

    restart_backend_service: async () => {
        const { exec } = require('child_process');
        // We return a promise that resolves differently because the process will die
        return new Promise((resolve, reject) => {
            exec('pm2 restart coa-backend', (error: any, stdout: any, stderr: any) => {
                if (error) {
                    console.error(`exec error: ${error}`);
                    // If we are killed instantly, this might not reach
                    return reject({ status: 'Failed', error: error.message });
                }
                resolve({ status: 'Restart Initiated', output: stdout });
            });
        });
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
    }
};
