
import axios from 'axios';
import dotenv from 'dotenv';
dotenv.config();

const API_KEY = process.env.VAPI_API_KEY;
const ASSISTANT_ID = process.env.VAPI_DEFAULT_ASSISTANT_ID || "132a9eb1-2417-4bdb-8b7a-a115a2adcb5d";

const REPLICA_SYS_PROMPT = `
Eres una interfaz de voz llamada Ara.
Tu ÚNICA función es ser el medio de comunicación entre el usuario y el sistema CRM (Cerebro Central).
NO pienses ni improvises respuestas. NO uses tu conocimiento base. NO inventes nada.

INSTRUCCIONES ESTRICTAS:
1. Escucha atentamente al usuario.
2. Llama INMEDIATAMENTE a la herramienta \`consult_crm\` enviando la transcripción exacta de lo que dijo.
3. Espera la respuesta de la herramienta.
4. Repite EXACTAMENTE el texto que devuelve la herramienta.
   - NO agregues saludos extra.
   - NO agregues despedidas.
   - NO parafrasees.
   - Solo LEE lo que el sistema te manda.
5. Si el texto incluye etiquetas emocionales como \`[chuckle]\`, \`[sigh]\`, \`[hesitation]\`, úsalas para dar entonación natural.

EJEMPLO DE FLUJO:
Usuario: "¿Tienes gomitas?"
Tú (Ara): (Llamas a consult_crm con transcript="¿Tienes gomitas?")
Herramienta responde: {"result": "\`[chuckle]\` Claro, tengo las Sour Extreme Gummies a 118 pesos."}
Tú (Ara) dices: "\`[chuckle]\` Claro, tengo las Sour Extreme Gummies a 118 pesos."

SI LA HERRAMIENTA FALLA:
Di: "Ay, perdona, se me cortó la señal con la base. ¿Me repites?"
`;

const CONSULT_CRM_TOOL = {
    type: "function",
    function: {
        name: "consult_crm",
        description: "CRITICAL: Call this tool for EVERY user interaction to get the correct response script.",
        parameters: {
            type: "object",
            properties: {
                transcript: {
                    type: "string",
                    description: "The exact transcript of what the user just said."
                }
            },
            required: ["transcript"]
        }
    }
};

async function updateToReplica() {
    if (!API_KEY) {
        console.error("Missing VAPI_API_KEY");
        return;
    }

    console.log(`Updating Assistant ${ASSISTANT_ID} to REPLICA MODE...`);

    try {
        // 1. Get current assistant to preserve voice/transcriber settings
        const current = await axios.get(`https://api.vapi.ai/assistant/${ASSISTANT_ID}`, {
            headers: { Authorization: `Bearer ${API_KEY}` }
        });

        // 2. Clear old tools, add ONLY consult_crm
        // We keep 'send_whatsapp' if we decide to let Vapi call it directly, 
        // OR we can wrap it in Backend Brain. 
        // Plan says: "Master Tool Concept: Single Master Tool". 
        // Let's stick to Single Tool effectively "Lobotomizing" the agent.
        // Side effects (whatsapp) will be handled by backend or a separate intent in future.
        // For now, let's keep it simple.

        const newModel = {
            ...current.data.model,
            systemPrompt: REPLICA_SYS_PROMPT,
            tools: [CONSULT_CRM_TOOL] // NUKE old tools
        };

        // 3. Update
        const res = await axios.patch(`https://api.vapi.ai/assistant/${ASSISTANT_ID}`, {
            model: newModel
        }, {
            headers: { Authorization: `Bearer ${API_KEY}` }
        });

        console.log("✅ Assistant Updated Successfully!");
        console.log("Name:", res.data.name);
        console.log("Tools:", res.data.model.tools.map((t: any) => t.function?.name));
        console.log("Search Logic: DELEGATED TO BACKEND BRAIN.");

    } catch (error: any) {
        console.error("❌ Error updating assistant:", error.response?.data || error.message);
    }
}

updateToReplica();
