
import axios from 'axios';
import dotenv from 'dotenv';
dotenv.config();

const API_KEY = process.env.VAPI_API_KEY;
const TOOL_IDS = [
    "f1696e07-488f-4d3b-827d-1a408c038877", // search_products
    "4155ddca-6353-451a-a216-dfe53973af08"  // get_coa
];

async function inspectTools() {
    console.log('--- INSPECTING VAPI TOOLS ---');

    for (const toolId of TOOL_IDS) {
        try {
            const res = await axios.get(`https://api.vapi.ai/tool/${toolId}`, {
                headers: { Authorization: `Bearer ${API_KEY}` }
            });

            const tool = res.data;
            console.log(`\nTool: ${tool.function?.name} (ID: ${tool.id})`);
            console.log(`Description: ${tool.function?.description}`);
            console.log(`Parameters Schema:`, JSON.stringify(tool.function?.parameters, null, 2));

            const required = tool.function?.parameters?.required || [];
            console.log(`Required Params: [${required.join(', ')}]`);

            if (tool.function?.name === 'search_products' && !required.includes('query')) {
                console.error('❌ CRITICAL: "query" is NOT required!');
            }
        } catch (e: any) {
            console.error(`❌ Error fetching tool ${toolId}:`, e.message);
        }
    }
}

inspectTools();
