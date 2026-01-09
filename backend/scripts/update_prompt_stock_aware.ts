
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
   - Good: search_products({ query: "hhc" })
3. Si el usuario no especificó qué busca, PREGUNTA antes de llamar a la herramienta.

INTERPRETACIÓN DE RESULTADOS:
- Si el producto aparece con "stock: No" o "stock_quantity: 0", DILE al cliente que lo manejas pero está AGOTADO. No digas "no encontré".
- Si buscas "gomitas", PRIORIZA los productos que digan "Gummies" en el título.
- REGLA DE ORO: Las "Hot Bites" **NO** son gomitas. No las menciones como gomitas.
- Si buscan "HHC", menciona el producto "Hexahidrocannabinol (HHC)" aunque diga que no hay stock (indica que está agotado).
- Los productos "Candy" o "Sour" pueden ser gomitas si el título lo dice (ej: "Sour Extreme Gummies").

ESTILO:
- Breve, amable y profesional.
- Si la herramienta falla, dilo honestamente.
`;

async function updateSystemPrompt() {
    console.log(`Fetching Assistant ${ASSISTANT_ID}...`);
    try {
        const getRes = await axios.get(`https://api.vapi.ai/assistant/${ASSISTANT_ID}`, {
            headers: { Authorization: `Bearer ${API_KEY}` }
        });

        const currentConfig = getRes.data;

        // Remove read-only fields
        delete currentConfig.id;
        delete currentConfig.orgId;
        delete currentConfig.createdAt;
        delete currentConfig.updatedAt;
        delete currentConfig.isServerUrlSecretSet;

        // Update system prompt
        if (currentConfig.model) {
            const systemMsgIndex = currentConfig.model.messages?.findIndex((m: any) => m.role === 'system');

            if (systemMsgIndex !== undefined && systemMsgIndex >= 0) {
                currentConfig.model.messages[systemMsgIndex].content = SYSTEM_PROMPT;
            } else {
                currentConfig.model.messages = [
                    ...(currentConfig.model.messages || []),
                    { role: 'system', content: SYSTEM_PROMPT }
                ];
            }
        }

        console.log(`Updating Assistant with new prompt (Stock Aware)...`);
        const patchRes = await axios.patch(`https://api.vapi.ai/assistant/${ASSISTANT_ID}`, currentConfig, {
            headers: { Authorization: `Bearer ${API_KEY}` }
        });

        console.log("✅ Assistant Prompt Updated Successfully!");
    } catch (e: any) {
        console.error("❌ Error:", e.message, e.response?.data);
    }
}

updateSystemPrompt();
