
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

// Load env
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error('❌ Missing Supabase credentials');
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const TARGET_CONV_ID = 'adfd127a-6285-45a0-a69e-7d7dfc6461fa';

async function simulate() {
    console.log(`👻 Injecting Ghost Data Inquiry into conversation ${TARGET_CONV_ID}...`);

    const inquiry = {
        id: `inq_${Date.now()}`,
        type: 'ghost_data',
        question: '⚠️ Detecté un pedido (ORD-992) sin tracking. ¿Ya se entregó?',
        options: [
            { label: 'Sí, entregado', action: 'ghost_mark_delivered', variant: 'primary' },
            { label: 'No, investigar', action: 'ghost_investigate', variant: 'danger' },
            { label: 'Ignorar', action: 'ignore', variant: 'neutral' }
        ],
        allow_custom: false
    };

    const { data: conv } = await supabase
        .from('conversations')
        .select('facts')
        .eq('id', TARGET_CONV_ID)
        .single();

    if (!conv) {
        console.error('❌ Conversation not found');
        return;
    }

    const newFacts = {
        ...conv.facts,
        system_inquiry: inquiry,
        // Clear old legacy flag just in case
        identity_ambiguity: false
    };

    const { error } = await supabase
        .from('conversations')
        .update({ facts: newFacts })
        .eq('id', TARGET_CONV_ID);

    if (error) {
        console.error('❌ Failed to inject inquiry:', error.message);
    } else {
        console.log('✅ Inquiry Injected! Check the UI.');
    }
}

simulate();
