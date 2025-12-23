
import { CRMService } from '../src/services/CRMService';
import dotenv from 'dotenv';
dotenv.config();

const main = async () => {
    try {
        const crmService = CRMService.getInstance();
        // Use the conversation ID from the screenshot if possible, or a known one.
        // Screenshot shows handle '3327177432'. I'll search for it first or just pick one.
        // Actually, let's just use a hardcoded valid conversation ID if known, 
        // OR search for that handle.
        const { createClient } = require('@supabase/supabase-js');
        const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

        const { data: conv } = await supabase.from('conversations').select('id').eq('contact_handle', '3327177432').single();

        if (!conv) {
            console.log('Conversation not found for 3327177432');
            return;
        }

        console.log('Testing Send Voice for:', conv.id);
        const text = "Hola amigo como estas, he llorado mucho por ti";

        await crmService.sendVoiceMessage(conv.id, text, 'assistant');
        console.log('Success!');
    } catch (e) {
        console.error('ERROR REPRODUCING:', e);
    }
};

main();
