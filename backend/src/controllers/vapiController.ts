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
        // Log full error details for debugging
        console.error('[Vapi Call Error]', {
            message: error.message,
            status: error.response?.status,
            data: error.response?.data,
            phoneNumber: req.body.phoneNumber
        });

        // Check if it's an API authentication error
        if (error.message?.includes('401') || error.response?.status === 401) {
            res.status(500).json({ error: 'Error de autenticación con VAPI. Verifica la API key.' });
            return;
        }

        // Return detailed error for 400 responses
        if (error.response?.status === 400) {
            const vapiError = error.response?.data?.message || error.response?.data?.error || 'Bad request to VAPI';
            res.status(400).json({ error: `VAPI Error: ${vapiError}` });
            return;
        }

        res.status(500).json({ error: error.message || 'Error al iniciar llamada' });
    }
};
