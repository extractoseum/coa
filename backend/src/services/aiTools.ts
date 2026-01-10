import { ToolRegistry } from './ToolRegistry';
import { ToolDispatcher } from './ToolDispatcher';

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
/**
 * List of tools available to the Admin Assistant
 * Dynamically loaded from registry
 */
export const getAdminTools = () => ToolRegistry.getInstance().getOpenAITools([
    'get_recent_orders',
    'search_clients',
    'search_shopify_customers',
    'get_customer_orders_live',
    'get_system_health',
    'read_file_content',
    'list_directory',
    'get_logs',
    'get_active_clients_count_today',
    'get_recent_scans_details',
    'search_products',
    'create_checkout_link',
    'send_whatsapp',
    'check_whatsapp_status',
    'initiate_voice_call',
    'send_sms_notification',
    'make_verification_call',
    'get_order_tracking',
    'search_order_by_number',
    'search_coas',
    'get_coa_details',
    'browser_action'
]);

// For backward compatibility while refactoring
export const ADMIN_TOOLS = getAdminTools();

/**
 * Handlers for the tools
 */
/**
 * Centralized tool handlers for OpenAI tools.
 * Delegates to ToolDispatcher.
 */
export const TOOL_HANDLERS: Record<string, (args: any, context?: any) => Promise<any>> = new Proxy({}, {
    get: (target, prop: string) => {
        return async (args: any, context?: any) => {
            console.log(`[aiTools] Delegating tool execution: ${prop}`);
            try {
                return await ToolDispatcher.execute(prop, args, context || {});
            } catch (error: any) {
                console.error(`[aiTools] Tool execution error (${prop}):`, error);
                return { success: false, error: error.message };
            }
        };
    }
});
