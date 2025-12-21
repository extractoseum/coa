
import { Request, Response } from 'express';
import { CRMService } from '../services/CRMService';

const crmService = CRMService.getInstance();

export const getColumns = async (req: Request, res: Response): Promise<void> => {
    try {
        const columns = await crmService.getColumns();
        res.json({ success: true, data: columns });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
};

export const getConversations = async (req: Request, res: Response): Promise<void> => {
    try {
        const conversations = await crmService.getConversations();
        res.json({ success: true, data: conversations });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
};

export const moveConversation = async (req: Request, res: Response): Promise<void> => {
    try {
        const { conversationId, targetColumnId } = req.body;
        if (!conversationId || !targetColumnId) {
            res.status(400).json({ success: false, error: 'Missing conversationId or targetColumnId' });
            return;
        }
        await crmService.moveConversation(conversationId, targetColumnId);
        res.json({ success: true });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
};

export const handleInbound = async (req: Request, res: Response): Promise<void> => {
    try {
        const { channel, handle, content, raw } = req.body;
        if (!channel || !handle || !content) {
            res.status(400).json({ success: false, error: 'Missing required fields' });
            return;
        }
        await crmService.processInbound(channel, handle, content, raw || {});
        res.json({ success: true });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
};

export const updateColumnConfig = async (req: Request, res: Response): Promise<void> => {
    try {
        const { id } = req.params;
        const { mode, config } = req.body;
        if (!id || !mode) {
            res.status(400).json({ success: false, error: 'Missing column id or mode' });
            return;
        }
        await crmService.updateColumnConfig(id, mode, config);
        res.json({ success: true });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
};
