import { Request, Response } from 'express';
import { VapiService } from '../services/VapiService';

const vapiService = new VapiService();

export const handleVapiWebhook = async (req: Request, res: Response): Promise<void> => {
    try {
        const result = await vapiService.handleWebhook(req.body);
        res.json(result);
    } catch (error: any) {
        console.error('[Vapi Webhook Error]', error);
        res.status(500).json({ error: error.message });
    }
};

export const initiateCall = async (req: Request, res: Response): Promise<void> => {
    try {
        const { phoneNumber, customerName, conversationId, assistantId } = req.body;

        if (!phoneNumber) {
            res.status(400).json({ error: 'Missing phone number' });
            return;
        }

        const call = await vapiService.createCall({
            phoneNumber,
            customerName,
            conversationId,
            assistantId
        });
        res.json(call);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};
