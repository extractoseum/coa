
import { supabase } from '../src/config/supabase';

async function auditLogs() {
    console.log("Fetching last 5 Vapi tool logs...");
    const { data: logs, error } = await supabase
        .from('vapi_tool_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(5);

    if (error) {
        console.error("Error:", error);
        return;
    }

    logs.forEach((log, i) => {
        console.log(`\n--- [${i + 1}] CALL: ${log.call_id} | TOOL: ${log.tool_name} ---`);
        console.log(`Time: ${log.created_at}`);
        console.log(`Args: ${JSON.stringify(log.arguments)}`);

        if (log.tool_name === 'search_products') {
            const summary = log.result_summary;
            if (typeof summary === 'string') {
                console.log(`Result Summary: ${summary.substring(0, 500)}...`);
            } else {
                console.log(`Result: Found ${log.data?.products?.length || 0} products.`);
                log.data?.products?.forEach((p: any) => {
                    console.log(`   * ${p.name} | Stock: ${p.stock_quantity}`);
                });
            }
        }
    });
}

auditLogs();
