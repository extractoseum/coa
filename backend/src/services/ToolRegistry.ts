
import * as fs from 'fs';
import * as path from 'path';
import { logger } from '../utils/Logger';
import { UCVTService } from './UCVTService';

export interface RegistryTool {
    name: string;
    description: string;
    category?: string;
    input_schema?: any;    // Anthropic format
    parameters?: any;      // OpenAI format
    examples?: any[];
    required_permissions?: string[];
}

export class ToolRegistry {
    private static instance: ToolRegistry;
    private tools: RegistryTool[] = [];

    private constructor() {
        this.loadRegistry();
    }

    public static getInstance(): ToolRegistry {
        if (!ToolRegistry.instance) {
            ToolRegistry.instance = new ToolRegistry();
        }
        return ToolRegistry.instance;
    }

    /**
     * Load tools from UCVT
     */
    private loadRegistry() {
        try {
            this.tools = UCVTService.getToolsRegistry();
            logger.info(`[ToolRegistry] Loaded ${this.tools.length} tools from UCVT.`);
        } catch (error) {
            logger.error('[ToolRegistry] Error loading registry:', error);
        }
    }

    /**
     * Get all raw tools
     */
    public getAllTools(): RegistryTool[] {
        return this.tools;
    }

    /**
     * Convert a tool to Anthropic format (Claude)
     */
    public toAnthropicFormat(toolName: string): any | null {
        const tool = this.tools.find(t => t.name === toolName);
        if (!tool) return null;

        // Force normalization to input_schema
        const schema = tool.input_schema || tool.parameters || { type: 'object', properties: {} };

        return {
            name: tool.name,
            description: tool.description,
            input_schema: schema
        };
    }

    /**
     * Convert a tool to OpenAI format (GPT)
     */
    public toOpenAIFormat(toolName: string): any | null {
        const tool = this.tools.find(t => t.name === toolName);
        if (!tool) return null;

        // Force normalization to parameters
        const parameters = tool.parameters || tool.input_schema || { type: 'object', properties: {} };

        return {
            name: tool.name,
            description: tool.description,
            parameters
        };
    }

    /**
     * Get a subset of tools in Anthropic format
     */
    public getAnthropicTools(toolNames: string[]): any[] {
        return toolNames
            .map(name => this.toAnthropicFormat(name))
            .filter(t => t !== null);
    }

    /**
     * Get a subset of tools in OpenAI format
     */
    public getOpenAITools(toolNames: string[]): any[] {
        return toolNames
            .map(name => this.toOpenAIFormat(name))
            .filter(t => t !== null);
    }

    /**
     * Get tools by category
     */
    public getByCategory(category: string): RegistryTool[] {
        return this.tools.filter(t => t.category === category);
    }

    /**
     * Force reload (useful for development)
     */
    public reload() {
        this.loadRegistry();
    }
}
