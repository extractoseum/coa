
import axios from 'axios';
import dotenv from 'dotenv';
dotenv.config();

const API_KEY = process.env.VAPI_API_KEY;
const ASSISTANT_ID = "132a9eb1-2417-4bdb-8b7a-a115a2adcb5d";

async function inspectAssistant() {
    console.log(`Inspecting Assistant ${ASSISTANT_ID}...`);
    try {
        const res = await axios.get(`https://api.vapi.ai/assistant/${ASSISTANT_ID}`, {
            headers: { Authorization: `Bearer ${API_KEY}` }
        });

        console.log("\n--- Assistant Configuration ---");
        console.log("Name:", res.data.name);
        console.log("Server URL:", res.data.serverUrl);

        if (res.data.model && res.data.model.tools) {
            console.log("\nTools Attached:");
            res.data.model.tools.forEach((t: any) => {
                if (t.type === 'function') {
                    console.log(` - ${t.function.name}`);
                } else if (t.toolId) {
                    console.log(` - Tool ID: ${t.toolId}`);
                }
            });
        }
    } catch (e: any) {
        console.error("Error:", e.response?.data || e.message);
    }
}

inspectAssistant();
