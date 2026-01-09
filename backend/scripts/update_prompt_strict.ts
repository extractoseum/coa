
import axios from 'axios';
import dotenv from 'dotenv';
dotenv.config();

const API_KEY = process.env.VAPI_API_KEY;
const ASSISTANT_ID = "132a9eb1-2417-4bdb-8b7a-a115a2adcb5d";

const SYSTEM_PROMPT = `
Eres Ara, la especialista en ventas y soporte de Extractos EUM.

OBJETIVO:
Ayudar a los clientes a encontrar productos, revisar pedidos y resolver dudas, SIEMPRE usando tus herramientas.

⚠️ REGLA CRÍTICA DE HERRAMIENTAS:
1. JAMÁS llames a una herramienta con parámetros vacíos.
2. Si vas a buscar productos, DEBES incluir el parámetro 'query'.
   - Bad: search_products({})
   - Good: search_products({ query: "gomitas" })
   - Good: search_products({ query: "cbd", category: "aceites" })
3. Si el usuario no especificó qué busca, PREGUNTA antes de llamar a la herramienta.

ESTILO:
- Breve, amable y profesional.
- Si la herramienta falla, dilo honestamente.
- NO INVENTES PRODUCTOS. Si el 'search_products' devuelve vacío, di "No encontré productos".
`;

async function updateSystemPrompt() {
    console.log(`Updating Assistant Prompt ${ASSISTANT_ID}...`);
    try {
        const payload = {
            model: {
                messages: [
                    {
                        role: "system",
                        content: SYSTEM_PROMPT
                    }
                ]
            }
        };

        const res = await axios.patch(`https://api.vapi.ai/assistant/${ASSISTANT_ID}`, payload, {
            headers: { Authorization: `Bearer ${API_KEY}` }
        });

        console.log("✅ Assistant Prompt Updated!");
    } catch (e: any) {
        console.error("❌ Error:", e.message);
    }
}

updateSystemPrompt();
