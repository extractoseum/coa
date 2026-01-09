
import axios from 'axios';
import dotenv from 'dotenv';
dotenv.config();

const API_KEY = process.env.VAPI_API_KEY;

async function fixTool() {
    // 1. FIX SEARCH_PRODUCTS
    const SEARCH_TOOL_ID = "f1696e07-488f-4d3b-827d-1a408c038877";
    console.log(`Updating Tool ${SEARCH_TOOL_ID}...`);

    const searchPayload = {
        function: {
            name: "search_products",
            description: "Busca productos en el catálogo de Extractos EUM. Úsala siempre que el usuario pregunte por disponibilidad, precios o variantes. Devuelve nombre, precio, stock y resumen.",
            parameters: {
                type: "object",
                properties: {
                    query: {
                        type: "string",
                        description: "Término de búsqueda. Ejemplos: 'gomitas', 'candy kush', 'cbd', 'vapes'."
                    },
                    category: {
                        type: "string",
                        description: "Categoría opcional para filtrar (ej. 'comestibles', 'vapes')."
                    }
                },
                required: ["query"]
            }
        }
    };

    try {
        const res = await axios.patch(`https://api.vapi.ai/tool/${SEARCH_TOOL_ID}`, searchPayload, {
            headers: { Authorization: `Bearer ${API_KEY}` }
        });
        console.log("✅ search_products Updated Successfully!");
    } catch (e: any) {
        console.error("❌ Error Updating search_products:", e.message, e.response?.data);
    }

    // 2. FIX GET_COA
    const COA_TOOL_ID = "4155ddca-6353-451a-a216-dfe53973af08";
    console.log(`Updating Tool ${COA_TOOL_ID}...`);

    const coaPayload = {
        function: {
            name: "get_coa",
            description: "Busca y recupera el Certificado de Análisis (COA/Lab Test) de un producto. IMPORTANTE: Debes proporcionar 'product_name' o 'batch_number'.",
            parameters: {
                type: "object",
                properties: {
                    batch_number: {
                        type: "string",
                        description: "Número de lote exacto si el cliente lo tiene (ej: EUM-CBD-001)."
                    },
                    product_name: {
                        type: "string",
                        description: "Nombre del producto o cannabinoide a buscar (ej: 'CBD Isolate', 'Candy Kush'). Obligatorio si no tienes lote."
                    },
                    send_whatsapp: {
                        type: "boolean",
                        description: "Si es true, envía el PDF y resumen por WhatsApp al terminar."
                    }
                },
                required: []
            }
        }
    };

    try {
        const res = await axios.patch(`https://api.vapi.ai/tool/${COA_TOOL_ID}`, coaPayload, {
            headers: { Authorization: `Bearer ${API_KEY}` }
        });
        console.log("✅ get_coa Updated Successfully!");
    } catch (e: any) {
        console.error("❌ Error Updating get_coa:", e.message);
    }
}

fixTool();
