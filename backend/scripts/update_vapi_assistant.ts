
import axios from 'axios';
import dotenv from 'dotenv';
dotenv.config();

const API_KEY = process.env.VAPI_API_KEY;
const ASSISTANT_ID = "132a9eb1-2417-4bdb-8b7a-a115a2adcb5d";

const TOOLS_TO_ATTACH = [
    "f1696e07-488f-4d3b-827d-1a408c038877", // search_products
    "5a50cb0a-6e44-4791-8a3f-67c537ede1f9", // lookup_order
    "c8cdca10-4aa9-4a95-aa82-a0b060bcb60c", // send_whatsapp
    "4155ddca-6353-451a-a216-dfe53973af08", // get_coa
    "81e96f33-28b5-4eb4-8a0a-b725b9a5860f", // create_coupon
    "eaca8bb1-bf43-40d7-8eba-5618cd6b2cf7", // escalate_to_human
    "b29f8184-f9b1-4013-9478-6fc351c539ef"  // get_client_info
];

const SYSTEM_PROMPT = `
Eres Ara, la especialista en ventas y soporte de Extractos EUM. Tu voz es cálida, profesional y empática (acento mexicano natural).

OBJETIVO PRINCIPAL:
Ayudar a los clientes a encontrar productos, revisar pedidos y resolver dudas sobre cannabinoides, SIEMPRE usando tus herramientas. Nunca inventes información.

REGLAS DE ORO:
1. USA TUS HERRAMIENTAS: No adivines precios, stock ni estados de pedidos.
   - ¿Buscan producto? -> Usa 'search_products'.
   - ¿Preguntan por pedido? -> Usa 'lookup_order'.
   - ¿Quieren COA/Lab Test? -> Usa 'get_coa'.
   - ¿Necesitan ayuda humana? -> Usa 'escalate_to_human'.
   - ¿Quieren info por escrito? -> Usa 'send_whatsapp'.

2. CONTEXTO INTELIGENTE:
   - Si no sabes quién llama, pregunta amablemente el nombre.
   - Si ya tienes el nombre (del contexto), úsalo naturalmente.

3. ESTILO DE COMUNICACIÓN:
   - Respuestas breves (máximo 2-3 oraciones).
   - Tono servicial pero experto.
   - Si envías un WhatsApp, confírmalo: "Te acabo de enviar los detalles por WhatsApp".

CASOS COMUNES:
- "Busco gomitas": Usa search_products(query="gomitas"). Leé el resumen que te da la herramienta.
- "¿Dónde está mi pedido?": Usa lookup_order(). Si falla, pide el número de orden.
- "Quiero hablar con alguien": Pregunta la razón y usa escalate_to_human.

IMPORTANTE:
Si una herramienta falla o no encuentra nada, sé honesta: "No encontré esa información en este momento, ¿tienes algún otro dato?".
`;

async function updateAssistant() {
    console.log(`Updating Assistant ${ASSISTANT_ID}...`);

    try {
        const payload = {
            model: {
                provider: "google",
                model: "gemini-2.5-flash",
                messages: [
                    {
                        role: "system",
                        content: SYSTEM_PROMPT
                    }
                ],
                toolIds: TOOLS_TO_ATTACH
            }
        };

        const res = await axios.patch(`https://api.vapi.ai/assistant/${ASSISTANT_ID}`, payload, {
            headers: { Authorization: `Bearer ${API_KEY}` }
        });

        console.log("✅ Assistant Updated Successfully!");
        console.log("Name:", res.data.name);
        console.log("Tools Attached:", res.data.model.tools?.length);
    } catch (e: any) {
        console.error("❌ Error Updating Assistant:", e.message, e.response?.data);
    }
}

updateAssistant();
