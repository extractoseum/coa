
import dotenv from 'dotenv';
dotenv.config();
import { supabase } from '../src/config/supabase';

async function investigate() {
    const callId = "132a9eb1-2417-4bdb-8b7a-a115a2adcb5d";

    console.log("--- TOOL LOGS FOR CALL ---");
    const { data: logs } = await supabase.from("vapi_tool_logs").select("*").eq("vapi_call_id", callId);
    console.log(JSON.stringify(logs, null, 2));

    console.log("\n--- PRODUCT CHECK (CandyKush) ---");
    const { data: products } = await supabase
        .from("products")
        .select("id, title, handle, product_type, tags, metadata, vendor, variants")
        .ilike("title", "%CandyKush%")
        .limit(3);

    if (products && products.length > 0) {
        console.log(`Found ${products.length} products like 'CandyKush'`);
        console.log("Sample Title:", products[0].title);
        console.log("Sample Variants:", JSON.stringify(products[0].variants).substring(0, 100) + "...");
        console.log("Sample Metadata:", JSON.stringify(products[0].metadata, null, 2));
    } else {
        console.log("No products found matching 'CandyKush'");
    }

    console.log("\n--- COA CHECK (Metadata Strategy) ---");
    if (products && products.length > 0) {
        // Check for specific metafields we use for COAs
        // Adjust this based on what we see in the logs
    }
}
investigate();
