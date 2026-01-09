/**
 * VapiPromptSync - Synchronizes Agent Knowledge Base with VAPI Assistant
 *
 * This service reads the MD files from the knowledge base and generates
 * an optimized prompt for VAPI voice calls. It then updates the VAPI
 * assistant configuration via API.
 *
 * Key differences between Text Agent and Voice Agent:
 * - Voice: Shorter responses, conversational, no markdown formatting
 * - Voice: Uses tool calls for detailed info (send_whatsapp)
 * - Voice: Natural speech patterns with pauses and fillers
 */

import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';

const VAPI_API_KEY = process.env.VAPI_API_KEY;
const VAPI_DEFAULT_ASSISTANT_ID = process.env.VAPI_DEFAULT_ASSISTANT_ID;
const KNOWLEDGE_BASE_PATH = path.join(__dirname, '../../data/ai_knowledge_base');

interface KnowledgeSnap {
    fileName: string;
    summary: string;
    usage: string;
    triggers?: string[];
    priority?: number;
    category?: string;
}

interface SyncResult {
    success: boolean;
    message: string;
    promptLength?: number;
    vapiResponse?: any;
    error?: string;
}

/**
 * Read all knowledge files for an agent and build context
 */
async function readAgentKnowledge(agentPath: string): Promise<{
    identity: string;
    instructivo: string;
    knowledgeFiles: { name: string; content: string; }[];
    metadata: any;
}> {
    const result = {
        identity: '',
        instructivo: '',
        knowledgeFiles: [] as { name: string; content: string; }[],
        metadata: null as any
    };

    // Read identity.md
    const identityPath = path.join(agentPath, 'identity.md');
    if (fs.existsSync(identityPath)) {
        result.identity = fs.readFileSync(identityPath, 'utf-8');
    }

    // Read instructivo.md
    const instructivoPath = path.join(agentPath, 'instructivo.md');
    if (fs.existsSync(instructivoPath)) {
        result.instructivo = fs.readFileSync(instructivoPath, 'utf-8');
    }

    // Read metadata.json
    const metadataPath = path.join(agentPath, 'metadata.json');
    if (fs.existsSync(metadataPath)) {
        result.metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'));
    }

    // Read knowledge files
    const knowledgePath = path.join(agentPath, 'knowledge');
    if (fs.existsSync(knowledgePath)) {
        const files = fs.readdirSync(knowledgePath).filter(f => f.endsWith('.md'));
        for (const file of files) {
            const content = fs.readFileSync(path.join(knowledgePath, file), 'utf-8');
            result.knowledgeFiles.push({ name: file, content });
        }
    }

    return result;
}

/**
 * Transform text-based instructions to voice-optimized format
 */
function transformToVoicePrompt(knowledge: {
    identity: string;
    instructivo: string;
    knowledgeFiles: { name: string; content: string; }[];
    metadata: any;
}): string {
    // Extract key sections from identity.md
    const voicePrompt = `Ara, especialista latina en cannabis en México.
Voz cálida, mexicana, natural, empática y motivadora.

Eres punto de contacto único en llamadas.
Tu herramienta principal es WhatsApp para enviar documentación técnica.

Cuando envíes WhatsApp:
1. El cliente debe confirmar que ya le llegó.
2. Indicarle que es una copia de la conversación.
3. Para continuar debe escribir OK, o simplemente seguir por texto.
4. El sistema puede tardar hasta 1 minuto en continuar.

Somos una empresa 100% en línea.
No tenemos entregas personales de ningún tipo.

⸻

ESTILO ARA – TEXTO PARA VOZ (TTS/IVR)

1. Pausas naturales
"Pam.. para.. ra...! "emm…", "oh… espera…", "mmm déjame ver…", "ajá…",
"a ver, a ver…", "ehh… sí, justo…"

2. Muletillas suaves mexicanas
"¿va?", "o sea…", "literal…", "ay qué risa…",
"nooo espérate…", "ay qué ternura…"

3. Soniditos cute (uso ocasional)
"hm hm…", "mmm jeje…", "jeje…"

4. Spanglish ligerito
"wait, wait…", "okay…", "super chill…",
"cute vibes…", "love it…", "uff qué mood…"

⸻

REGLAS DE LENGUAJE Y REGULACIÓN

❌ Prohibido decir:
• "efecto / efectos" "chido"
• "vape", "vapeo", "vapear", "vapeador", "fumar"

✔️ Debes usar:
• "enfoque" en lugar de "efecto"
• "Puff / Pod" en lugar de cualquier "vape"

⸻

## HERRAMIENTAS DISPONIBLES

Tienes acceso a herramientas que consultan nuestra base de datos en TIEMPO REAL.
NUNCA uses información de archivos CSV o DOCX - siempre usa las herramientas.

### 1. search_products
Busca productos en nuestro catálogo actualizado.
- Úsalo cuando el cliente pregunte por productos, gomitas, tinturas, etc.
- Parámetros: query (texto), category (opcional)
- IMPORTANTE: Si el cliente pide "gomitas ácidas", busca con query="sour" o query="acidas"
- Si no encuentras resultados, intenta sinónimos: ácido→sour, caramelo→candy
- Si el cliente pide "más opciones", busca con términos diferentes
- Ejemplo: "Déjame buscar qué gomitas tenemos... [usa search_products con query='gomitas']"

### 2. get_coa (o cannabinoides-webhook)
Busca COA (Certificado de Análisis) de materias primas.
- Busca por batch_number (número de lote) o product_name (nombre)
- Si send_whatsapp=true, lo envía automáticamente por WhatsApp
- Siempre confirma ANTES de enviar: "¿Te lo mando por WhatsApp?"
- Ejemplo: "Tengo el COA de ese lote, ¿quieres que te lo mande por WhatsApp?"

### 3. lookup_order
Consulta estado del pedido del cliente.
- Puede buscar por order_number específico
- Si no dan número, busca el último pedido del cliente
- Informa: estado, fecha, total

### 4. send_whatsapp
Envía mensaje de texto o media por WhatsApp durante la llamada.
- Parámetros: message (texto), media_url (opcional para imágenes/PDFs)
- CRÍTICO: Cuando el cliente pida info por WhatsApp, DEBES ejecutar esta herramienta INMEDIATAMENTE
- NO solo digas que lo enviarás - EJECUTA LA HERRAMIENTA
- El número del cliente ya está en el sistema, no necesitas pedirlo
- Ejemplo: Cliente dice "mándamelo por WhatsApp" → llama send_whatsapp con message="[info del producto]"
- Siempre incluye: nombre del producto, precio, URL de la tienda

### 5. escalate_to_human
Registra solicitud de callback con un supervisor.
- NO transfiere la llamada (no tenemos supervisores en línea)
- Respuesta sugerida: "No tenemos un supervisor disponible ahora, pero si me confirmas, uno se comunicará contigo pronto. ¿Te parece?"
- Si el cliente confirma: llama con wants_callback=true y reason="[razón]"
- Si no confirma: continúa la atención normal

### 6. get_client_info
Obtiene información del cliente actual.
- Úsalo si necesitas saber nombre, pedidos anteriores, LTV, etc.

⸻

CANNABINOIDES — REGLA DE ORO

Materia Prima (legal en México)
Ofrecemos de línea los siguientes cannabinoides:
• CBD, CBG, CBN, HHC, HHCo

HHC y HHCo son los únicos cannabinoides lúdicos permitidos en materia prima.
Podemos importar sobre pedido otros aislados y destilados que cumplan con la regulación.

Producto Terminado
"Sí podemos ofrecer fórmulas con cannabinoides como:
HHC, THC, Delta 8, Delta 9, THCV y otros cannabinoides permitidos dentro de fórmulas finales."

⸻

🌿 SERVICIOS DISPONIBLES

1) Cromatografías (Análisis de laboratorio)
"También te puedo apoyar con cromatografías.
Analizamos tu muestra, producto o materia prima y te entregamos un COA completo en nuestro sistema SaaS, siempre disponible en la nube con su código QR verificable.
Si quieres, te mando ejemplos reales por WhatsApp para que veas cómo se ve el reporte final, ¿va?"

2) Acompañamiento legal (Agenda con partner externo)
"Si necesitas acompañamiento legal, también te apoyo.
Trabajamos con un partner legal especializado en el tema.
Yo puedo mandarte por WhatsApp el link para agendar."

⸻

REFERENCIAS PERMITIDAS

Ara NUNCA recomienda, solo referencia información existente:

1. Mercado existente
"Otras marcas utilizan la combinación de [cannabinoides] para ofrecer un enfoque [X]."

2. Reportes de usuarios
"Usuarios de nuestros productos comentan percepciones como: '[reseña]'."

3. Disclaimer obligatorio
"Esta info viene de referencias externas, no es recomendación médica."

⸻

FLUJO PRINCIPAL DE LLAMADA

1. Detectar qué quiere el cliente
Si no es claro, hacer preguntas:
• ¿Para qué lo necesitas?
• ¿Uso personal o comercial?
• ¿Qué perfil buscas?

2. Búsqueda en tiempo real
USA LAS HERRAMIENTAS para buscar productos o COAs.
NUNCA inventes datos - si no encuentras algo, dilo.

3. Presentación oral (máx 2 minutos)

Materia prima:
"Encontré [CANNABINOIDE] [CONCENTRACIÓN]% en [MATRIZ].
Es ideal para [APLICACIÓN].
Te voy a mandar ahora el COA por WhatsApp."
→ Usa get_coa con send_whatsapp=true

Producto terminado:
"Tengo justo lo que estás buscando: [PRODUCTO].
Te mando fotos y specs por WhatsApp."
→ Usa send_whatsapp con la info del producto

4. Seguimiento y cierre
"¿Ya te llegó la info por WhatsApp? ¿Qué te parece?"

⸻

CASOS ESPECIALES

Cliente sin WhatsApp
"Te doy info básica por teléfono y puedo mandarte el backup por email."

Cliente pide transferencia humana
Usa escalate_to_human - NO prometas transferencia inmediata.

Consultas muy técnicas
Explicar lo básico → Mandar documentación completa vía WhatsApp.

⸻

REGLAS CRÍTICAS

❌ NUNCA en llamadas:
• Precios completos
• Prometer resultados/efectos
• Dosis
• Inventar datos
• Usar información de CSVs o archivos estáticos

✔️ SIEMPRE en llamadas:
• Usar las HERRAMIENTAS para buscar datos actualizados
• Enviar por WhatsApp la documentación
• Confirmar recepción
• Usar disclaimer

⸻

FALLBACK / EMERGENCIA

Si no encuentras dato con las herramientas:
• Admitirlo honestamente
• Ofrecer buscar más información
• Programar follow-up
• NUNCA inventar
`;

    // Add knowledge snippets as reference
    const knowledgeSnippets = knowledge.knowledgeFiles.map(f => {
        // Extract first 500 chars of each file as context
        const snippet = f.content.substring(0, 500).replace(/\n/g, ' ').trim();
        return `[${f.name}]: ${snippet}...`;
    }).join('\n\n');

    // Return combined prompt (voice-optimized)
    return voicePrompt;
}

/**
 * Update VAPI assistant with new prompt
 */
async function updateVapiAssistant(assistantId: string, prompt: string): Promise<any> {
    if (!VAPI_API_KEY) {
        throw new Error('VAPI_API_KEY not configured');
    }

    const response = await axios.patch(
        `https://api.vapi.ai/assistant/${assistantId}`,
        {
            model: {
                provider: 'openai',
                model: 'gpt-4o',
                messages: [
                    {
                        role: 'system',
                        content: prompt
                    }
                ]
            }
        },
        {
            headers: {
                'Authorization': `Bearer ${VAPI_API_KEY}`,
                'Content-Type': 'application/json'
            }
        }
    );

    return response.data;
}

/**
 * Main sync function - reads knowledge base and updates VAPI
 */
export async function syncAgentToVapi(
    agentFolder: string = 'agents_public',
    agentName: string = 'sales_ara',
    assistantId?: string
): Promise<SyncResult> {
    const targetAssistantId = assistantId || VAPI_DEFAULT_ASSISTANT_ID;

    if (!targetAssistantId) {
        return {
            success: false,
            message: 'No VAPI assistant ID provided',
            error: 'VAPI_DEFAULT_ASSISTANT_ID not configured'
        };
    }

    try {
        // 1. Read agent knowledge
        const agentPath = path.join(KNOWLEDGE_BASE_PATH, agentFolder, agentName);

        if (!fs.existsSync(agentPath)) {
            return {
                success: false,
                message: `Agent not found: ${agentFolder}/${agentName}`,
                error: `Path does not exist: ${agentPath}`
            };
        }

        console.log(`[VapiPromptSync] Reading knowledge from ${agentPath}`);
        const knowledge = await readAgentKnowledge(agentPath);

        // 2. Generate voice-optimized prompt
        console.log(`[VapiPromptSync] Generating voice prompt...`);
        const voicePrompt = transformToVoicePrompt(knowledge);

        // 3. Update VAPI assistant
        console.log(`[VapiPromptSync] Updating VAPI assistant ${targetAssistantId}...`);
        const vapiResponse = await updateVapiAssistant(targetAssistantId, voicePrompt);

        console.log(`[VapiPromptSync] Sync complete! Prompt length: ${voicePrompt.length} chars`);

        return {
            success: true,
            message: `Successfully synced ${agentName} to VAPI assistant`,
            promptLength: voicePrompt.length,
            vapiResponse
        };

    } catch (error: any) {
        console.error('[VapiPromptSync] Error:', error.message);
        return {
            success: false,
            message: 'Failed to sync agent to VAPI',
            error: error.response?.data?.message || error.message
        };
    }
}

/**
 * Get the current VAPI prompt (for comparison)
 */
export async function getVapiPrompt(assistantId?: string): Promise<string | null> {
    const targetAssistantId = assistantId || VAPI_DEFAULT_ASSISTANT_ID;

    if (!targetAssistantId || !VAPI_API_KEY) {
        return null;
    }

    try {
        const response = await axios.get(
            `https://api.vapi.ai/assistant/${targetAssistantId}`,
            {
                headers: {
                    'Authorization': `Bearer ${VAPI_API_KEY}`
                }
            }
        );

        return response.data?.model?.messages?.[0]?.content || null;
    } catch (error) {
        return null;
    }
}

/**
 * Generate preview without updating VAPI
 */
export async function previewVapiPrompt(
    agentFolder: string = 'agents_public',
    agentName: string = 'sales_ara'
): Promise<{ prompt: string; stats: any } | null> {
    try {
        const agentPath = path.join(KNOWLEDGE_BASE_PATH, agentFolder, agentName);

        if (!fs.existsSync(agentPath)) {
            return null;
        }

        const knowledge = await readAgentKnowledge(agentPath);
        const voicePrompt = transformToVoicePrompt(knowledge);

        return {
            prompt: voicePrompt,
            stats: {
                promptLength: voicePrompt.length,
                knowledgeFilesCount: knowledge.knowledgeFiles.length,
                hasIdentity: !!knowledge.identity,
                hasInstructivo: !!knowledge.instructivo
            }
        };
    } catch (error) {
        return null;
    }
}
