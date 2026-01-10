import { ToolDispatcher, DispatchResult } from './ToolDispatcher';
import { ToolContext } from './AgentToolService';

/**
 * VapiToolHandlers - Unified Wrapper for Voice Bot Tools
 * 
 * Now fully delegated to ToolDispatcher for centralized logic and auditing.
 */

export type ToolCallContext = ToolContext;
export type ToolResult = DispatchResult;

/**
 * Legacy Router for Vapi/Voice Service
 */
export async function handleToolCall(
    toolName: string,
    args: any,
    context: ToolCallContext
): Promise<ToolResult> {
    return ToolDispatcher.execute(toolName, args, context);
}
