
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

const main = async () => {
    const convId = '32fa3a3c-1370-4bd3-9bf2-fae593f64842';
    // 1. Get Column ID
    const { data: conv } = await supabase.from('conversations').select('column_id').eq('id', convId).single();
    if (!conv) return console.log('Conv not found');

    // 2. Restore Custom Settings
    const KINA_ID = 'JBFqnCBsd6RMkjVDRZzb';
    const CUSTOM_SETTINGS = {
        stability: 0.1,
        similarity_boost: 0.85,
        style: 0.9,
        use_speaker_boost: true,
        speed: 1.0
    };

    // We update the voice_profile JSON
    const { error } = await supabase
        .from('crm_columns')
        .update({
            voice_profile: {
                provider: 'elevenlabs',
                voice_id: KINA_ID,
                settings: CUSTOM_SETTINGS
            }
        })
        .eq('id', conv.column_id);

    if (error) console.error('Error updating:', error);
    else console.log('Restored custom voice settings (Stability 0.1, Style 0.9)!');
};

main();
