import { Request, Response } from 'express';
import { AIConversationService } from '../services/aiConversationService';

export const createConversation = async (req: Request, res: Response): Promise<void> => {
    try {
        const { model, message } = req.body;
        // Assume user ID from auth context or default
        const userId = (req as any).user?.id || 'super_admin';

        const service = AIConversationService.getInstance();
        const conversation = service.createConversation(userId, model, message);

        res.json({ success: true, data: conversation });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
};

export const listConversations = async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = (req as any).user?.id || 'super_admin';
        const service = AIConversationService.getInstance();
        const conversations = service.getConversations(userId);

        res.json({ success: true, data: conversations });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
};

export const getConversation = async (req: Request, res: Response): Promise<void> => {
    try {
        const { id } = req.params;
        const service = AIConversationService.getInstance();
        const conversation = service.getConversation(id);

        if (!conversation) {
            res.status(404).json({ success: false, error: 'Conversation not found' });
            return;
        }

        res.json({ success: true, data: conversation });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
};

export const deleteConversation = async (req: Request, res: Response): Promise<void> => {
    try {
        const { id } = req.params;
        const service = AIConversationService.getInstance();
        const success = service.deleteConversation(id);

        if (!success) {
            res.status(404).json({ success: false, error: 'Conversation not found' });
            return;
        }

        res.json({ success: true });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
};
