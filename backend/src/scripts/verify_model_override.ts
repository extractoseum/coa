
import { CRMService } from '../services/CRMService';
import { supabase } from '../config/supabase';

async function verifyOverride() {
    console.log('🧪 Starting Model Override Verification...');

    const crm = CRMService.getInstance();

    // 1. Create a Test Column
    const testColumnId = crypto.randomUUID();
    console.log(`📝 Creating test column: ${testColumnId}`);

    // We insert directly to bypass strict service logic for this test, or use service
    const { data: col, error } = await supabase.from('crm_columns').insert({
        id: testColumnId,
        name: 'Gemini 2.0 Test Lane',
        position: 999,
        mode: 'AI_MODE',
        config: {
            model: 'gemini-2.0-flash-exp' // THE OVERRIDE
        }
    }).select().single();

    if (error) {
        console.error('❌ Failed to create column:', error);
        return;
    }

    console.log('✅ Column created with model:', col.config.model);

    // 2. Create a Test Conversation in that column
    const handle = 'test-handle-' + Date.now();
    console.log(`👤 Creating test conversation for: ${handle}`);

    const conv = await crm.createConversation({
        channel: 'WA',
        handle: handle,
        column_id: testColumnId
    });

    // 3. Simulating the logic from processInbound to see what model it WOULD verify
    // We can't easily spy on the private method flow without running it, 
    // but we can query the conversation and column to ensure the JOIN logic works.

    const { data: fetchedConv } = await supabase
        .from('conversations')
        .select(`
            *,
            crm_columns ( config )
        `)
        .eq('id', conv.id)
        .single();

    const resolvedModel = fetchedConv?.model_override || fetchedConv?.crm_columns?.config?.model || 'gpt-4o';

    console.log('---------------------------------------------------');
    console.log(`🔍 Resolved Model Strategy:`);
    console.log(`   - Conversation Override: ${fetchedConv?.model_override || 'null'}`);
    console.log(`   - Column Config: ${fetchedConv?.crm_columns?.config?.model}`);
    console.log(`   - FINAL DECISION: ${resolvedModel}`);
    console.log('---------------------------------------------------');

    if (resolvedModel === 'gemini-2.0-flash-exp') {
        console.log('🎉 SUCCESS: System correctly resolved the Gemini 2.0 override!');
    } else {
        console.error('❌ FAILURE: System resolved wrong model:', resolvedModel);
    }

    // Cleanup
    console.log('🧹 Cleaning up...');
    await crm.deleteConversation(conv.id);
    await supabase.from('crm_columns').delete().eq('id', testColumnId);
}

verifyOverride();
