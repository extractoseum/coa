
import dotenv from 'dotenv';
import path from 'path';

// Load env
dotenv.config({ path: path.resolve(__dirname, '../../backend/.env') });

// Direct Service Import
import { CRMService } from '../src/services/CRMService';
import { getVoiceMessage } from '../src/services/whapiService';
import { supabase } from '../src/config/supabase';
// Import VoiceService based on how it is exported. It was `export class VoiceService` so we can import it like this or require it.
import { VoiceService } from '../src/services/VoiceService';

async function run() {
    console.log('--- Simulating Whapi Audio Logic Directly ---');

    const REAL_MSG_ID = 'rF0hEOcL_t.OiSIoSsKI.w-hYA6IScAgKM';
    const REAL_VOICE_ID = 'oga-ac5d2110e70bfedf8e8922284ac288fb-85803a21270080a3';

    // 1. First test the fetcher alone to be 100% sure
    console.log('1. Testing getVoiceMessage fetcher...');
    const buffer = await getVoiceMessage(REAL_VOICE_ID);
    if (!buffer) {
        console.error('❌ Fetcher returned null. Cannot proceed with simulation.');
        return;
    }
    console.log(`✅ Fetcher worked! Buffer size: ${buffer.length}`);

    // 2. Simulate the Controller Logic manually
    console.log('\n2. Simulating Controller Upload Logic...');

    // MATCHING CONTROLLER FALLBACK
    const bucket = process.env.STORAGE_BUCKET_ATTACHMENTS || 'images';
    const filename = `voice_inbound/TEST_${Date.now()}_${REAL_MSG_ID}.ogg`;

    const { error: uploadError } = await supabase.storage
        .from(bucket)
        .upload(filename, buffer, { contentType: 'audio/ogg', upsert: false });

    if (!uploadError) {
        const { data: publicData } = supabase.storage.from(bucket).getPublicUrl(filename);
        console.log(`✅ Upload Success! URL: ${publicData.publicUrl}`);

        // 3. Call processInbound with this NEW URL
        console.log('\n3. Calling CRMService.processInbound with recovered URL...');
        const crm = CRMService.getInstance();

        // SIMULATE OUTBOUND AGENT MESSAGE
        const createdMsg = await crm.processInbound('WA', '4941301513', `[Audio](${publicData.publicUrl})`, {
            id: 'TEST_SIM_' + Date.now(),
            type: 'audio',
            role: 'assistant',
            direction: 'outbound',
            _generated_from_me: true,
            from_me: true
        });
        console.log('✅ CRMService processed mocked inbound message.');

        if (createdMsg) {
            console.log(`[CRM] Analyze Voice with Role: ${createdMsg.role}`);
            const vs = new VoiceService();

            // Manually trigger the voice logic as the controller .then() block would
            await vs.processVoiceMessage(
                buffer,
                'audio/ogg',
                undefined,
                createdMsg.conversation_id,
                createdMsg.id,
                publicData.publicUrl,
                createdMsg.role as 'user' | 'assistant' // Pass the role correctly
            );
            console.log('✅ VoiceService executed.');
        } else {
            console.log('⚠️ No message created (duplicate or skipped).');
        }

    } else {
        console.warn(`❌ Storage upload failed: ${uploadError.message}`);
    }
}

run();
