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

import { logger } from '../utils/Logger';

const router = Router();

/**
 * POST /api/voice/incoming
 * Twilio webhook for incoming calls
 */
router.post('/incoming', async (req: Request, res: Response) => {
    try {
        // Debug logging for deployment issues
        if (!req.body) {
            logger.warn('[VoiceRoutes] req.body is missing/undefined', null, {
                headers: req.headers,
                contentType: req.get('content-type')
            });
        } else {
            logger.info('[VoiceRoutes] Incoming payload', {
                bodyKeys: Object.keys(req.body),
                contentType: req.get('content-type')
            });
        }

        const { CallSid, From, To, CallStatus } = req.body || {};

        if (!CallSid) {
            logger.error('[VoiceRoutes] Missing CallSid in body', null, { body: req.body });
            // Fallback for empty body/testing:
            // throw new Error("Missing CallSid"); 
        }

        logger.info(`[VoiceRoutes] Incoming call: ${CallSid} from ${From}`);

        const twiml = await voiceCallService.handleIncomingCall(CallSid, From, To);

        res.type('text/xml');
        res.send(twiml);

    } catch (error: any) {
        logger.error('[VoiceRoutes] Incoming call error', error);
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

        // For outbound calls, also connect to the WebSocket stream
        const backUrl = process.env.BACKEND_URL || 'https://coa.extractoseum.com';
        const wsUrl = backUrl.replace('https://', 'wss://').replace('http://', 'ws://');

        // Reuse the logic? Or just generate the Stream TwiML directly?
        // VoiceCallService has generateIncomingCallTwiML which connects to /api/voice/stream/:callSid
        const twiml = voiceCallService.generateIncomingCallTwiML(CallSid);

        res.type('text/xml');
        res.send(twiml);

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
    const deepgramConfigured = !!process.env.DEEPGRAM_API_KEY;
    const elevenLabsVoiceId = process.env.ELEVENLABS_VOICE_ID || 'EXAVITQu4vr4xnSDxMaL';

    res.json({
        service: 'VoiceCallService',
        provider: 'Twilio + Deepgram + Claude + ElevenLabs',
        activeCalls: voiceCallService.getActiveCallCount(),
        configured: twilioConfigured && claudeConfigured && deepgramConfigured,
        debug: {
            twilio: twilioConfigured,
            claude: claudeConfigured,
            deepgram: deepgramConfigured,
            elevenLabsVoiceId: elevenLabsVoiceId.substring(0, 8) + '...' // Partial for security
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

/**
 * GET /api/voice/debug-client
 * Debug client lookup by phone number
 */
router.get('/debug-client', async (req: Request, res: Response) => {
    const { phone } = req.query;

    if (!phone || typeof phone !== 'string') {
        res.json({ error: 'Missing phone parameter. Use ?phone=3327177432' });
        return;
    }

    const { supabase } = await import('../config/supabase');

    // Clean phone same way as VoiceCallService
    const cleanPhone = phone.replace(/\D/g, '').slice(-10);

    // Try different search methods
    const results: any = {
        input: phone,
        cleanedPhone: cleanPhone,
        searches: []
    };

    // Search 1: ilike with %cleanPhone%
    const { data: search1, error: err1 } = await supabase
        .from('clients')
        .select('id, name, phone, email')
        .ilike('phone', `%${cleanPhone}%`)
        .limit(5);

    results.searches.push({
        method: `ilike phone '%${cleanPhone}%'`,
        found: search1?.length || 0,
        data: search1,
        error: err1?.message
    });

    // Search 2: or with 52 prefix
    const { data: search2, error: err2 } = await supabase
        .from('clients')
        .select('id, name, phone, email')
        .or(`phone.ilike.%${cleanPhone}%,phone.ilike.%52${cleanPhone}%`)
        .limit(5);

    results.searches.push({
        method: `or phone contains ${cleanPhone} or 52${cleanPhone}`,
        found: search2?.length || 0,
        data: search2,
        error: err2?.message
    });

    // Search 3: Get sample of clients to see phone formats
    const { data: sample } = await supabase
        .from('clients')
        .select('id, name, phone')
        .not('phone', 'is', null)
        .limit(10);

    results.samplePhoneFormats = sample?.map(c => ({
        name: c.name?.substring(0, 15),
        phone: c.phone
    }));

    // Search 4: Direct text search
    const { data: search4 } = await supabase
        .from('clients')
        .select('id, name, phone')
        .textSearch('phone', cleanPhone);

    results.searches.push({
        method: `textSearch ${cleanPhone}`,
        found: search4?.length || 0,
        data: search4
    });

    res.json(results);
});

/**
 * GET /api/voice/debug-calls
 * View recent voice calls with transcripts
 */
router.get('/debug-calls', async (req: Request, res: Response) => {
    const { supabase } = await import('../config/supabase');
    const limit = parseInt(req.query.limit as string) || 10;

    try {
        // Fetch recent voice calls
        const { data: calls, error } = await supabase
            .from('voice_calls')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(limit);

        if (error) {
            res.json({ error: error.message });
            return;
        }

        // Format the response
        const formattedCalls = calls?.map(call => ({
            id: call.id,
            call_sid: call.vapi_call_id,
            phone_number: call.phone_number,
            direction: call.direction,
            status: call.status,
            duration_seconds: call.duration_seconds,
            created_at: call.created_at,
            ended_at: call.ended_at,
            client_id: call.client_id,
            conversation_id: call.conversation_id,
            transcript: call.transcript,
            messages_json: call.messages_json || [],
            message_count: call.messages_json?.length || 0,
            context_injected: call.context_injected,
            context_data: call.context_data
        }));

        res.json({
            total: formattedCalls?.length || 0,
            calls: formattedCalls
        });

    } catch (error: any) {
        res.json({ error: error.message });
    }
});

/**
 * GET /api/voice/debug-calls/:callSid
 * View specific call with full transcript
 */
router.get('/debug-calls/:callSid', async (req: Request, res: Response) => {
    const { supabase } = await import('../config/supabase');
    const { callSid } = req.params;

    try {
        const { data: call, error } = await supabase
            .from('voice_calls')
            .select('*')
            .eq('call_sid', callSid)
            .single();

        if (error) {
            res.json({ error: error.message, callSid });
            return;
        }

        // Also fetch related messages
        let messages: any[] = [];
        if (call?.conversation_id) {
            const { data: msgs } = await supabase
                .from('messages')
                .select('*')
                .eq('conversation_id', call.conversation_id)
                .order('created_at', { ascending: true });
            messages = msgs || [];
        }

        res.json({
            call,
            transcript: call?.transcript,
            messages_json: call?.messages_json || [],
            related_messages: messages
        });

    } catch (error: any) {
        res.json({ error: error.message });
    }
});

export default router;
