/**
 * Voice Routes - Twilio Webhooks for Voice Calls
 *
 * These routes handle:
 * - Incoming call webhooks
 * - Speech recognition results (Gather)
 * - Call status updates
 * - Outbound call initiation
 */

import { Router, Request, Response } from 'express';
import { voiceCallService } from '../services/VoiceCallService';

const router = Router();

/**
 * POST /api/voice/incoming
 * Twilio webhook for incoming calls
 */
router.post('/incoming', async (req: Request, res: Response) => {
    try {
        const { CallSid, From, To, CallStatus } = req.body;

        console.log(`[VoiceRoutes] Incoming call: ${CallSid} from ${From}`);

        const twiml = await voiceCallService.handleIncomingCall(CallSid, From, To);

        res.type('text/xml');
        res.send(twiml);

    } catch (error: any) {
        console.error('[VoiceRoutes] Incoming call error:', error.message, error.stack);
        res.type('text/xml');
        res.send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say voice="Polly.Mia-Neural" language="es-MX">Lo siento, hay un problema técnico. Por favor intenta más tarde.</Say>
    <Hangup/>
</Response>`);
    }
});

/**
 * POST /api/voice/gather/:callSid
 * Twilio webhook for speech recognition results
 */
router.post('/gather/:callSid', async (req: Request, res: Response) => {
    try {
        const { callSid } = req.params;
        const { SpeechResult, Confidence } = req.body;

        console.log(`[VoiceRoutes] Gather result for ${callSid}: "${SpeechResult}" (confidence: ${Confidence})`);

        if (!SpeechResult) {
            // No speech detected, prompt again
            res.type('text/xml');
            res.send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say voice="Polly.Mia-Neural" language="es-MX">No te escuché. ¿Podrías repetir?</Say>
    <Gather input="speech" timeout="5" speechTimeout="auto" action="/api/voice/gather/${callSid}" method="POST" language="es-MX">
    </Gather>
    <Say voice="Polly.Mia-Neural" language="es-MX">Gracias por llamar. ¡Hasta pronto!</Say>
</Response>`);
            return;
        }

        const twiml = await voiceCallService.handleSpeechInput(callSid, SpeechResult);

        res.type('text/xml');
        res.send(twiml);

    } catch (error: any) {
        console.error('[VoiceRoutes] Gather error:', error.message);
        res.type('text/xml');
        res.send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say voice="Polly.Mia-Neural" language="es-MX">Disculpa, tuve un problema. ¿Podrías repetir?</Say>
    <Gather input="speech" timeout="5" speechTimeout="auto" action="/api/voice/gather/${req.params.callSid}" method="POST" language="es-MX">
    </Gather>
</Response>`);
    }
});

/**
 * POST /api/voice/outbound-connect
 * TwiML for outbound calls when answered
 */
router.post('/outbound-connect', async (req: Request, res: Response) => {
    try {
        const { CallSid, To } = req.body;

        console.log(`[VoiceRoutes] Outbound call answered: ${CallSid}`);

        // For outbound calls, start with greeting and gather
        const backendUrl = process.env.BACKEND_URL || 'https://coa-api-production.up.railway.app';

        res.type('text/xml');
        res.send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say voice="Polly.Mia-Neural" language="es-MX">Hola, soy Ara de Extractos EUM. ¿Cómo estás?</Say>
    <Gather input="speech" timeout="5" speechTimeout="auto" action="${backendUrl}/api/voice/gather/${CallSid}" method="POST" language="es-MX">
        <Say voice="Polly.Mia-Neural" language="es-MX">¿En qué puedo ayudarte hoy?</Say>
    </Gather>
    <Say voice="Polly.Mia-Neural" language="es-MX">No te escuché. Te llamaré más tarde. ¡Hasta pronto!</Say>
</Response>`);

    } catch (error: any) {
        console.error('[VoiceRoutes] Outbound connect error:', error.message);
        res.type('text/xml');
        res.send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say voice="Polly.Mia-Neural" language="es-MX">Disculpa, hay un problema. Te llamaremos más tarde.</Say>
    <Hangup/>
</Response>`);
    }
});

/**
 * POST /api/voice/status
 * Twilio webhook for call status updates
 */
router.post('/status', async (req: Request, res: Response) => {
    try {
        const { CallSid, CallStatus, CallDuration, ErrorCode, ErrorMessage } = req.body;

        console.log(`[VoiceRoutes] Status update: ${CallSid} -> ${CallStatus}`);

        if (ErrorCode) {
            console.error(`[VoiceRoutes] Call error: ${ErrorCode} - ${ErrorMessage}`);
        }

        await voiceCallService.handleStatusCallback(CallSid, CallStatus);

        res.sendStatus(200);

    } catch (error: any) {
        console.error('[VoiceRoutes] Status callback error:', error.message);
        res.sendStatus(500);
    }
});

/**
 * POST /api/voice/call
 * API endpoint to initiate outbound calls (from CRM/Frontend)
 */
router.post('/call', async (req: Request, res: Response) => {
    try {
        const { phoneNumber, customerName, conversationId } = req.body;

        if (!phoneNumber) {
            res.status(400).json({ error: 'Missing phone number' });
            return;
        }

        console.log(`[VoiceRoutes] Initiating outbound call to ${phoneNumber}`);

        const result = await voiceCallService.makeOutboundCall({
            phoneNumber,
            customerName,
            conversationId
        });

        if (result.success) {
            res.json({
                success: true,
                callSid: result.callSid,
                message: 'Call initiated'
            });
        } else {
            res.status(500).json({
                success: false,
                error: result.error
            });
        }

    } catch (error: any) {
        console.error('[VoiceRoutes] Call initiation error:', error.message);
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/voice/end/:callSid
 * API endpoint to end an active call
 */
router.post('/end/:callSid', async (req: Request, res: Response) => {
    try {
        const { callSid } = req.params;

        await voiceCallService.endCall(callSid);

        res.json({ success: true, message: 'Call ended' });

    } catch (error: any) {
        console.error('[VoiceRoutes] End call error:', error.message);
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/voice/status
 * Get current voice service status
 */
router.get('/status', (req: Request, res: Response) => {
    const twilioConfigured = !!(process.env.TWILIO_ACCOUNT_SID || process.env.ACCOUNT_SID);
    const claudeConfigured = !!process.env.ANTHROPIC_API_KEY;

    res.json({
        service: 'VoiceCallService',
        provider: 'Twilio + Claude',
        activeCalls: voiceCallService.getActiveCallCount(),
        configured: twilioConfigured && claudeConfigured,
        debug: {
            twilio: twilioConfigured,
            claude: claudeConfigured
        }
    });
});

/**
 * GET /api/voice/test-incoming
 * Test the incoming call handler without Twilio
 */
router.get('/test-incoming', async (req: Request, res: Response) => {
    try {
        console.log('[VoiceRoutes] Testing incoming call handler...');
        const twiml = await voiceCallService.handleIncomingCall('TEST-' + Date.now(), '+525512345678', '+525596616455');
        res.type('text/xml');
        res.send(twiml);
    } catch (error: any) {
        res.json({
            error: true,
            message: error.message,
            stack: error.stack,
            name: error.name
        });
    }
});

export default router;
