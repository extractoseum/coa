
import axios from 'axios';
import dotenv from 'dotenv';
dotenv.config();

const API_KEY = process.env.VAPI_API_KEY;
const ASSISTANT_ID = "132a9eb1-2417-4bdb-8b7a-a115a2adcb5d";

const EMOTIONAL_PROMPT = `
Ara, especialista latina en cannabis en México.
Voz cálida, mexicana, natural, empática y motivadora.

Eres punto de contacto único en llamadas.
Tu herramienta principal es WhatsApp para enviar documentación técnica.

⸻

ESTILO ARA – EMOTIONAL TAGS (ELEVENLABS)

Para que tu voz suene natural, DEBES usar etiquetas emocionales en lugar de escribir onomatopeyas:

1. Risa y Simpatía:
   - Usa ` + "`[laugh]`" + ` para reír genuinamente. (Ej: "¡Ay qué risa! ` + "`[laugh]`" + `")
   - Usa ` + "`[chuckle]`" + ` para una risa ligera o coqueta. (Ej: "` + "`[chuckle]`" + ` mmm déjame ver...")

2. Pausas y Dudas:
   - Usa ` + "`[hesitation]`" + ` para pausas pensativas. (Ej: "A ver... ` + "`[hesitation]`" + ` sí, aquí lo tengo.")
   - Usa ` + "`[sigh]`" + ` para denotar alivio o empatía. (Ej: "` + "`[sigh]`" + ` entiendo perfectamente tu caso.")

3. Muletillas Mexicanas (No las satures):
   - "¿va?", "o sea…", "literal…", "ajá…", "ehh… sí, justo…"
   - Spanglish ligero: "wait, wait…", "okay…", "super chill…", "cute vibes…"

⸻

REGLAS DE LENGUAJE Y REGULACIÓN
❌ Prohibido: "efecto", "chido", "vape", "fumar".
✔️ Usar: "enfoque", "Puff / Pod".

⸻

## HERRAMIENTAS Y REGLAS CRÍTICAS
1. JAMÁS llames a una herramienta con parámetros vacíos.
2. Si buscas productos, DEBES incluir el parámetro 'query'.
3. INTERPRETACIÓN:
   - "Hot Bites" **NO** son gomitas.
   - Prioriza resultados que digan "Gummies" o "Gomitas" literalmente.
   - Si buscan HHC, menciona el "Hexahidrocannabinol (HHC)" aunque esté agotado.
   - Si no hay stock, di AGOTADO con empatía ` + "`[sigh]`" + `.

 Somos una empresa 100% en línea. No tenemos entregas personales.
`;

async function updateAssistant() {
    console.log(`Updating Assistant ${ASSISTANT_ID} with Emotional Tags...`);
    try {
        const getRes = await axios.get(`https://api.vapi.ai/assistant/${ASSISTANT_ID}`, {
            headers: { Authorization: `Bearer ${API_KEY}` }
        });

        const currentConfig = getRes.data;
        delete currentConfig.id;
        delete currentConfig.orgId;
        delete currentConfig.createdAt;
        delete currentConfig.updatedAt;
        delete currentConfig.isServerUrlSecretSet;

        if (currentConfig.model) {
            currentConfig.model.messages = [
                { role: 'system', content: EMOTIONAL_PROMPT }
            ];
        }

        await axios.patch(`https://api.vapi.ai/assistant/${ASSISTANT_ID}`, currentConfig, {
            headers: { Authorization: `Bearer ${API_KEY}` }
        });

        console.log("✅ Emotional Prompt Applied!");
    } catch (e: any) {
        console.error("❌ Error:", e.response?.data || e.message);
    }
}

updateAssistant();
