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
 * POST /api/voice/recording-status
 * Twilio webhook for recording completion - saves audio URL to database
 */
router.post('/recording-status', async (req: Request, res: Response) => {
    try {
        const {
            CallSid,
            RecordingSid,
            RecordingUrl,
            RecordingStatus,
            RecordingDuration
        } = req.body;

        logger.info(`[VoiceRoutes] Recording status: ${RecordingStatus} for call ${CallSid}`);

        if (RecordingStatus === 'completed' && RecordingUrl) {
            // RecordingUrl from Twilio is the base URL, add .mp3 for playable format
            const audioUrl = `${RecordingUrl}.mp3`;

            const { supabase } = await import('../config/supabase');

            // Update voice_call record with recording URL
            const { error } = await supabase
                .from('voice_calls')
                .update({
                    recording_url: audioUrl,
                    recording_sid: RecordingSid,
                    duration_seconds: parseInt(RecordingDuration) || 0
                })
                .eq('vapi_call_id', CallSid);

            if (error) {
                logger.error(`[VoiceRoutes] Failed to save recording URL`, error, { CallSid });
            } else {
                logger.info(`[VoiceRoutes] Recording saved for ${CallSid}: ${audioUrl}`);
            }
        }

        res.sendStatus(200);

    } catch (error: any) {
        logger.error('[VoiceRoutes] Recording status error:', error);
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
 * GET /api/voice/debug-orders/:phone
 * Debug order lookup by phone - verify data format
 */
router.get('/debug-orders/:phone', async (req: Request, res: Response) => {
    const { supabase } = await import('../config/supabase');
    const { phone } = req.params;
    const cleanPhone = phone.replace(/\D/g, '').slice(-10);

    try {
        // Search 1: Direct phone match (orders uses customer_phone, not phone)
        const { data: orders1 } = await supabase
            .from('orders')
            .select('id, order_number, customer_phone, customer_email, financial_status, fulfillment_status, total_amount')
            .or(`customer_phone.ilike.%${cleanPhone}%,customer_phone.ilike.%52${cleanPhone}%`)
            .limit(5);

        // Search 2: Get sample orders to see phone format
        const { data: sampleOrders } = await supabase
            .from('orders')
            .select('order_number, customer_phone')
            .not('customer_phone', 'is', null)
            .limit(10);

        // Search 3: Check conversation format
        const { data: conversation } = await supabase
            .from('conversations')
            .select('id, contact_handle, contact_name, facts')
            .ilike('contact_handle', `%${cleanPhone}%`)
            .limit(1)
            .maybeSingle();

        // Search 4: Look for order 1441 specifically
        const { data: order1441 } = await supabase
            .from('orders')
            .select('order_number, customer_phone, customer_email, financial_status')
            .ilike('order_number', '%1441%')
            .limit(1)
            .maybeSingle();

        // Search 5: Check clients table format
        const { data: clientByPhone } = await supabase
            .from('clients')
            .select('id, name, phone, email')
            .or(`phone.ilike.%${cleanPhone}%,phone.ilike.%52${cleanPhone}%`)
            .limit(3);

        // Search 6: Sample clients to see phone format
        const { data: sampleClients } = await supabase
            .from('clients')
            .select('name, phone')
            .not('phone', 'is', null)
            .limit(10);

        // Search 7: Check crm_contact_snapshots (KEY for finding client_id linkage!)
        const { data: snapshot } = await supabase
            .from('crm_contact_snapshots')
            .select('id, handle, name, client_id, email, ltv, orders_count')
            .ilike('handle', `%${cleanPhone}%`)
            .limit(1)
            .maybeSingle();

        // Search 8: Find orders by client_id (from snapshot OR from clients table)
        let ordersByClientId: any[] = [];
        const clientIdToSearch = snapshot?.client_id || clientByPhone?.[0]?.id;
        if (clientIdToSearch) {
            const { data: ordersFromClient } = await supabase
                .from('orders')
                .select('id, order_number, customer_phone, customer_email, total_amount, financial_status, client_id')
                .eq('client_id', clientIdToSearch)
                .order('created_at', { ascending: false })
                .limit(5);
            ordersByClientId = ordersFromClient || [];
        }

        res.json({
            input: phone,
            cleanedPhone: cleanPhone,
            ordersFoundByPhone: orders1?.length || 0,
            orders: orders1,
            samplePhoneFormats: sampleOrders?.map(o => ({ order: o.order_number, customer_phone: o.customer_phone })),
            conversationFound: conversation ? {
                id: conversation.id,
                contact_handle: conversation.contact_handle,
                contact_name: conversation.contact_name
            } : null,
            order1441: order1441,
            clientsFoundByPhone: clientByPhone?.length || 0,
            clients: clientByPhone,
            sampleClientPhones: sampleClients?.map(c => ({ name: c.name?.substring(0, 15), phone: c.phone })),
            // Snapshot lookup
            snapshot: snapshot ? {
                name: snapshot.name,
                client_id: snapshot.client_id,
                email: snapshot.email,
                ltv: snapshot.ltv,
                orders_count: snapshot.orders_count
            } : null,
            // Client ID used for order search
            clientIdUsed: clientIdToSearch || null,
            ordersByClientId: ordersByClientId.map(o => ({
                order_number: o.order_number,
                customer_phone: o.customer_phone,
                customer_email: o.customer_email,
                total_amount: o.total_amount,
                client_id: o.client_id
            }))
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

/**
 * GET /api/voice/test-context/:phone
 * Test getCustomerContext logic directly - simulates what happens during a call
 */
router.get('/test-context/:phone', async (req: Request, res: Response) => {
    const { supabase } = await import('../config/supabase');
    const { phone } = req.params;
    const logs: string[] = [];

    const log = (msg: string) => {
        logs.push(`${new Date().toISOString()} - ${msg}`);
    };

    try {
        // Simulate exactly what getCustomerContext does
        const cleanPhone = phone.replace(/\D/g, '').slice(-10);
        log(`Input: ${phone} -> cleanPhone: ${cleanPhone}`);

        // STRATEGY 1: Search in clients table (only columns that exist!)
        log(`Strategy 1: Searching clients table for phone containing: ${cleanPhone}`);
        let { data: client, error: err1 } = await supabase
            .from('clients')
            .select('id, name, phone, email, tags')
            .ilike('phone', `%${cleanPhone}%`)
            .limit(1)
            .maybeSingle();

        if (err1) {
            log(`Strategy 1 ERROR: ${err1.message}`);
        }
        log(`Strategy 1 result: client=${client ? client.name : 'null'}, id=${client?.id || 'null'}`);

        // If not found, try with country code
        if (!client && cleanPhone.length === 10) {
            log(`Strategy 1B: Trying with 52 prefix`);
            const { data: client2, error: err2 } = await supabase
                .from('clients')
                .select('id, name, phone, email, tags')
                .or(`phone.ilike.%${cleanPhone}%,phone.ilike.%52${cleanPhone}%`)
                .limit(1)
                .maybeSingle();
            if (err2) {
                log(`Strategy 1B ERROR: ${err2.message}`);
            }
            client = client2;
            log(`Strategy 1B result: client=${client ? client.name : 'null'}, id=${client?.id || 'null'}`);
        }

        // STRATEGY 2: Search conversations (no client_id column!)
        log(`Strategy 2: Searching conversations by contact_handle`);
        const { data: conversation, error: err3 } = await supabase
            .from('conversations')
            .select('id, contact_handle, facts, column_id, tags')
            .ilike('contact_handle', `%${cleanPhone}%`)
            .order('updated_at', { ascending: false })
            .limit(1)
            .maybeSingle();
        if (err3) {
            log(`Strategy 2 ERROR: ${err3.message}`);
        }
        log(`Strategy 2 result: conversation=${conversation?.id || 'null'}`);

        // STRATEGY 3: Search snapshots (no client_id column!)
        log(`Strategy 3: Searching crm_contact_snapshots`);
        const { data: snapshot, error: err4 } = await supabase
            .from('crm_contact_snapshots')
            .select('name, ltv, orders_count, email')
            .ilike('handle', `%${cleanPhone}%`)
            .limit(1)
            .maybeSingle();
        if (err4) {
            log(`Strategy 3 ERROR: ${err4.message}`);
        }
        log(`Strategy 3 result: snapshot=${snapshot?.name || 'null'}`);

        // If client found, get orders
        let orders: any[] = [];
        if (client) {
            log(`Getting orders for client_id: ${client.id}`);
            const { data: orderData, error: orderErr } = await supabase
                .from('orders')
                .select('id, order_number, total_amount, financial_status, created_at')
                .eq('client_id', client.id)
                .order('created_at', { ascending: false })
                .limit(5);
            if (orderErr) {
                log(`Orders ERROR: ${orderErr.message}`);
            } else {
                orders = orderData || [];
                log(`Found ${orders.length} orders`);
            }
        }

        // Calculate total spent from orders
        const totalSpent = orders.reduce((sum, o) => sum + (parseFloat(o.total_amount) || 0), 0);

        // Determine what would be returned
        let result: any = { channelChipId: null, columnId: null };
        if (client) {
            result = {
                clientId: client.id,
                clientName: client.name,
                clientTags: client.tags || [],
                orders: orders.map(o => ({ order_number: o.order_number, total: o.total_amount })),
                totalSpent
            };
            log(`SUCCESS: Would return clientId=${client.id}, clientName=${client.name}, orders=${orders.length}`);
        } else if (conversation) {
            result = {
                conversationId: conversation.id
            };
            log(`PARTIAL: Would return conversationId=${conversation.id}`);
        } else {
            log(`FAILED: No client, conversation, or snapshot found`);
        }

        res.json({
            input: phone,
            cleanPhone,
            logs,
            result,
            raw: {
                client: client ? { id: client.id, name: client.name, phone: client.phone } : null,
                conversation: conversation ? { id: conversation.id, handle: conversation.contact_handle } : null,
                snapshot: snapshot ? { name: snapshot.name, email: snapshot.email } : null,
                ordersCount: orders.length
            }
        });
    } catch (error: any) {
        log(`EXCEPTION: ${error.message}`);
        res.json({ error: error.message, logs });
    }
});

/**
 * GET /api/voice/test-whatsapp/:phone
 * Test the complete send_whatsapp flow - simulates what happens during a voice call
 */
router.get('/test-whatsapp/:phone', async (req: Request, res: Response) => {
    const { sendWhatsAppMessage } = await import('../services/whapiService');
    const { normalizePhone } = await import('../utils/phoneUtils');
    const { phone } = req.params;
    const testMessage = req.query.msg as string || 'Test message from voice call debug';
    const logs: string[] = [];

    const log = (msg: string) => {
        logs.push(`${new Date().toISOString()} - ${msg}`);
    };

    try {
        log(`Input phone: ${phone}`);

        // Step 1: Normalize for Whapi
        const normalizedPhone = normalizePhone(phone, 'whapi');
        log(`Normalized for Whapi: ${normalizedPhone}`);

        // Step 2: Normalize for Twilio (what comes in during call)
        const twilioFormat = normalizePhone(phone, 'twilio');
        log(`Twilio format would be: ${twilioFormat}`);

        // Step 3: Show what normalizePhone does step by step
        const cleanDigits = phone.replace(/\D/g, '');
        log(`Clean digits: ${cleanDigits} (length: ${cleanDigits.length})`);

        if (cleanDigits.length === 10) {
            log(`Case: 10 digits -> Would add 521 prefix for Whapi`);
        } else if (cleanDigits.length === 12 && cleanDigits.startsWith('52')) {
            log(`Case: 12 digits starting with 52 -> Would convert to 521 for Whapi`);
        } else if (cleanDigits.length === 13 && cleanDigits.startsWith('521')) {
            log(`Case: 13 digits starting with 521 -> Already correct for Whapi`);
        } else {
            log(`Case: Unhandled format - ${cleanDigits.length} digits`);
        }

        // Step 4: Actually try to send (only if ?send=true)
        let sendResult: any = null;
        if (req.query.send === 'true') {
            log(`SENDING WhatsApp to ${normalizedPhone}...`);
            sendResult = await sendWhatsAppMessage({
                to: phone,  // Pass raw phone - let service normalize
                body: testMessage
            });
            log(`Send result: ${JSON.stringify(sendResult)}`);
        } else {
            log(`DRY RUN - Add ?send=true to actually send`);
        }

        res.json({
            input: phone,
            normalizedForWhapi: normalizedPhone,
            twilioFormat,
            cleanDigits,
            logs,
            sendResult,
            instructions: 'Add ?send=true&msg=Your message to actually send'
        });
    } catch (error: any) {
        log(`ERROR: ${error.message}`);
        res.json({ error: error.message, logs });
    }
});

/**
 * GET /api/voice/call-logs/:phone
 * Get recent voice calls for a phone number with full details
 */
router.get('/call-logs/:phone', async (req: Request, res: Response) => {
    const { supabase } = await import('../config/supabase');
    const { phone } = req.params;
    const cleanPhone = phone.replace(/\D/g, '').slice(-10);

    try {
        const { data: calls, error } = await supabase
            .from('voice_calls')
            .select('*')
            .or(`phone_number.ilike.%${cleanPhone}%`)
            .order('created_at', { ascending: false })
            .limit(10);

        if (error) {
            return res.json({ error: error.message });
        }

        res.json({
            phone: cleanPhone,
            callCount: calls?.length || 0,
            calls: calls?.map(c => ({
                id: c.id,
                vapi_call_id: c.vapi_call_id,
                phone: c.phone_number,
                direction: c.direction,
                status: c.status,
                duration: c.duration_seconds,
                client_id: c.client_id,
                client_name: c.client_name,
                client_type: c.client_type,
                created_at: c.created_at,
                transcript: c.transcript?.substring(0, 500),
                has_recording: !!c.recording_url
            }))
        });
    } catch (error: any) {
        res.json({ error: error.message });
    }
});

/**
 * GET /api/voice/comm-health
 * Get health status of all communication channels
 */
router.get('/comm-health', async (req: Request, res: Response) => {
    const { getChannelHealth, runHealthCheck } = await import('../services/SmartCommunicationService');

    try {
        // Run health check if requested
        const doCheck = req.query.check === 'true';
        const health = doCheck ? await runHealthCheck() : getChannelHealth();

        // Calculate summary
        const healthy = health.filter(h => h.status === 'healthy').length;
        const degraded = health.filter(h => h.status === 'degraded').length;
        const down = health.filter(h => h.status === 'down').length;

        res.json({
            summary: {
                total: health.length,
                healthy,
                degraded,
                down,
                overallStatus: down > 0 ? 'degraded' : healthy === health.length ? 'healthy' : 'degraded'
            },
            channels: health,
            timestamp: new Date().toISOString(),
            hint: 'Add ?check=true to run live health check'
        });
    } catch (error: any) {
        res.json({ error: error.message });
    }
});

/**
 * POST /api/voice/comm-test
 * Test sending a message through SmartCommunicationService
 */
router.post('/comm-test', async (req: Request, res: Response) => {
    const { sendSmartMessage } = await import('../services/SmartCommunicationService');

    try {
        const { to, message, type = 'informational', subject } = req.body;

        if (!to || !message) {
            return res.status(400).json({ error: 'Missing required fields: to, message' });
        }

        const result = await sendSmartMessage({
            to,
            subject: subject || 'Test desde SmartCommunicationService',
            body: message,
            type: type as any,
            metadata: { source: 'comm_test_endpoint' }
        });

        res.json({
            success: result.success,
            channelUsed: result.channelUsed,
            channelsAttempted: result.channelsAttempted,
            emailSent: result.emailSent,
            channelResults: result.channelResults,
            error: result.error
        });
    } catch (error: any) {
        res.json({ error: error.message });
    }
});

/**
 * POST /api/voice/comm-reset/:channel
 * Reset health status of a channel after manual intervention
 */
router.post('/comm-reset/:channel', async (req: Request, res: Response) => {
    const { resetChannelHealth, getChannelHealth } = await import('../services/SmartCommunicationService');

    try {
        const { channel } = req.params;
        const tokenIndex = parseInt(req.query.tokenIndex as string) || 0;

        if (!['whatsapp', 'email', 'sms', 'push'].includes(channel)) {
            return res.status(400).json({ error: 'Invalid channel. Must be: whatsapp, email, sms, or push' });
        }

        resetChannelHealth(channel as any, tokenIndex);

        res.json({
            success: true,
            message: `Channel ${channel}[${tokenIndex}] health reset`,
            currentHealth: getChannelHealth()
        });
    } catch (error: any) {
        res.json({ error: error.message });
    }
});

/**
 * GET /api/voice/comm-logs/:phone
 * Get communication logs for a phone number
 */
router.get('/comm-logs/:phone', async (req: Request, res: Response) => {
    const { supabase } = await import('../config/supabase');
    const { phone } = req.params;
    const cleanPhone = phone.replace(/\D/g, '').slice(-10);

    try {
        const { data: logs, error } = await supabase
            .from('communication_logs')
            .select('*')
            .or(`recipient.ilike.%${cleanPhone}%`)
            .order('created_at', { ascending: false })
            .limit(20);

        if (error) {
            return res.json({ error: error.message });
        }

        // Calculate stats
        const stats = {
            total: logs?.length || 0,
            successful: logs?.filter(l => l.success).length || 0,
            failed: logs?.filter(l => !l.success).length || 0,
            byChannel: {} as Record<string, number>
        };

        logs?.forEach(l => {
            if (l.channel_used) {
                stats.byChannel[l.channel_used] = (stats.byChannel[l.channel_used] || 0) + 1;
            }
        });

        res.json({
            phone: cleanPhone,
            stats,
            logs: logs?.map(l => ({
                id: l.id,
                type: l.message_type,
                success: l.success,
                channelUsed: l.channel_used,
                channelsAttempted: l.channels_attempted,
                results: l.channel_results,
                createdAt: l.created_at
            }))
        });
    } catch (error: any) {
        res.json({ error: error.message });
    }
});

export default router;
