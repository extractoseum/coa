
import { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';

// Define path to the tools registry
const TOOLS_REGISTRY_PATH = path.join(__dirname, '../../data/ai_knowledge_base/core/tools_registry.json');

export const getTools = async (req: Request, res: Response): Promise<void> => {
    try {
        if (!fs.existsSync(TOOLS_REGISTRY_PATH)) {
            res.status(404).json({ success: false, error: 'Tools registry file not found' });
            return;
        }

        const content = fs.readFileSync(TOOLS_REGISTRY_PATH, 'utf-8');
        const tools = JSON.parse(content);

        res.json({
            success: true,
            data: tools
        });
    } catch (error: any) {
        console.error('[ToolsController] Failed to get tools:', error.message);
        res.status(500).json({ success: false, error: 'Failed to read tools registry' });
    }
};

export const updateTools = async (req: Request, res: Response): Promise<void> => {
    try {
        const { tools } = req.body;

        if (!tools || !Array.isArray(tools)) {
            res.status(400).json({ success: false, error: 'Invalid tools format. Must be an array.' });
            return;
        }

        // Basic validation: Check if items have name and description
        const invalidItem = tools.find((t: any) => !t.name || !t.description);
        if (invalidItem) {
            res.status(400).json({ success: false, error: 'All tools must have a name and description.' });
            return;
        }

        // Ensure directory exists (it should, but safety first)
        const dir = path.dirname(TOOLS_REGISTRY_PATH);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        // Write with pretty print
        fs.writeFileSync(TOOLS_REGISTRY_PATH, JSON.stringify(tools, null, 4), 'utf-8');

        console.log(`[ToolsController] Tools registry updated. (${tools.length} items)`);

        res.json({
            success: true,
            message: 'Tools registry updated successfully',
            count: tools.length
        });

    } catch (error: any) {
        console.error('[ToolsController] Failed to update tools:', error.message);
        res.status(500).json({ success: false, error: 'Failed to write tools registry' });
    }
};
