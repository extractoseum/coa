
import { TOOL_HANDLERS } from '../services/aiTools';
import 'dotenv/config';

async function testGenericSearch() {
    console.log('🧪 Testing Vector Search...');

    // Test query related to the ingested data (reviews)
    const query = "gummies for sleep";

    console.log(`🔎 Query: "${query}"`);

    // Simulate Tool Call
    // We assume the handler initializes services correctly
    // Note: This relies on aiService being able to initialize inside the handler

    const result = await TOOL_HANDLERS.search_knowledge_base({ query });

    console.log('📦 Result:', JSON.stringify(result, null, 2));

    if (result && result.results && result.results.length > 0) {
        console.log('✅ Success! Found results.');
    } else {
        console.log('❌ Failed. No results found.');
    }
}

testGenericSearch();
