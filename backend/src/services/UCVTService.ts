import fs from 'fs';
import path from 'path';
import { logger } from '../utils/Logger';

/**
 * UCVTService - Universal Center of Truth Service
 * 
 * Centralizes retrieval of all AI configurations, tool registries, 
 * and agent identities from the /backend/data/ucvt directory.
 */
export class UCVTService {
    private static ucvtBase = path.join(process.cwd(), 'data', 'ucvt');

    /**
     * Get the full Tools Registry
     */
    public static getToolsRegistry(): any[] {
        try {
            const filePath = path.join(this.ucvtBase, 'tools', 'tools_registry.json');
            if (fs.existsSync(filePath)) {
                return JSON.parse(fs.readFileSync(filePath, 'utf8'));
            }
            logger.warn('UCVT: tools_registry.json not found in UCVT, falling back to legacy path.');
            // Fallback to legacy path for transition phase
            const legacyPath = path.join(process.cwd(), 'data', 'ai_knowledge_base', 'core', 'tools_registry.json');
            return JSON.parse(fs.readFileSync(legacyPath, 'utf8'));
        } catch (err) {
            logger.error('UCVT: Error loading tools registry', err);
            return [];
        }
    }

    /**
     * Get Agent identity by name
     */
    public static getAgentConfig(agentName: string): any {
        try {
            const filePath = path.join(this.ucvtBase, 'agents', `${agentName}.json`);
            if (fs.existsSync(filePath)) {
                return JSON.parse(fs.readFileSync(filePath, 'utf8'));
            }
            return null;
        } catch (err) {
            logger.error(`UCVT: Error loading agent config for ${agentName}`, err);
            return null;
        }
    }

    /**
     * Get Global Config settings
     */
    public static getGlobalConfig(): any {
        try {
            const filePath = path.join(this.ucvtBase, 'global_config.json');
            if (fs.existsSync(filePath)) {
                return JSON.parse(fs.readFileSync(filePath, 'utf8'));
            }
            return {};
        } catch (err) {
            logger.error('UCVT: Error loading global config', err);
            return {};
        }
    }
}
