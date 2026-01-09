
import { handleSearchProducts, handleGetCOA, handleLookupOrder, handleSendWhatsApp } from './VapiToolHandlers';

interface ReplicaContext {
    conversationId?: string;
    clientId?: string;
    customerPhone?: string;
}

export class VapiReplicaService {

    /**
     * The Master Method: Takes raw audio transcript, decides intent, runs logic, returns script.
     */
    async handleConsultCRM(transcript: string, context: ReplicaContext): Promise<{ result: string }> {
        console.log(`[VapiReplica] Transcript: "${transcript}"`);

        const cleanText = transcript.toLowerCase();
        const intent = this.classifyIntent(cleanText);
        console.log(`[VapiReplica] Detected Intent: ${intent}`);

        let responseText = '';

        try {
            switch (intent) {
                case 'GREETING':
                    responseText = "¡Hola! `[chuckle]` Soy Ara. ¿En qué te puedo echar la mano hoy?";
                    break;

                case 'PRODUCTS':
                    // Extract potential query terms (remove filler words)
                    const query = cleanText
                        .replace(/quiero|busco|tienes|me das|precio|de|que|hay|vendes/g, '')
                        .trim();

                    const pResult = await handleSearchProducts({ query: query || 'general' }, context);

                    if (pResult.success) {
                        // Use the message from handler but maybe spice it up?
                        // The handler message is already: "Encontré estos productos: X. ¿Te interesa...?"
                        responseText = this.addPersonality(pResult.message || '', 'positive');
                    } else {
                        responseText = "`[sigh]` Mmm, no encontré nada con eso. ¿Buscas algo más específico?";
                    }
                    break;

                case 'COA':
                    // Naive extraction of batch/product
                    const coaQuery = cleanText.replace(/coa|analisis|certificado|lote|tienes el|de/g, '').trim();
                    const cResult = await handleGetCOA({ product_name: coaQuery, send_whatsapp: false }, context); // Don't send yet, ask first

                    if (cResult.success) {
                        responseText = this.addPersonality(cResult.message || '', 'positive');
                    } else {
                        responseText = "`[hesitation]` No vi ese COA a la mano. ¿Tienes el número de lote exacto?";
                    }
                    break;

                case 'ORDER':
                    const oResult = await handleLookupOrder({}, context); // Uses context phone/client
                    responseText = this.addPersonality(oResult.message || '', 'neutral');
                    break;

                case 'WHATSAPP_CONFIRM':
                    // If user says "mandamelo" or "por whatsapp"
                    return { result: "Va, te lo mando ahorita mismo. `[chuckle]` ¿Me confirmas si te llega?" };

                default:
                    // Fallback / General QA
                    // For now, static safe response. In future, this could be Knowledge Base lookup.
                    responseText = "`[hesitation]` Perdona, no te entendí bien. ¿Me decías de algún producto o de tu pedido?";
            }
        } catch (e) {
            console.error('[VapiReplica] Error:', e);
            responseText = "`[sigh]` Ay, se me trabó el sistema un segundito. ¿Me repites?";
        }

        return { result: responseText };
    }

    /**
     * Simple Keyword Classifier
     */
    private classifyIntent(text: string): string {
        if (text.match(/hola|buenos dias|buenas tardes/)) return 'GREETING';
        if (text.match(/tienes|busco|quiero|precio|vendes|gomitas|gummies|hot bites|hhc|thc|cbd|vape|pod|cartucho|bateria|aceite|crema|tintura|comestible/)) return 'PRODUCTS';
        if (text.match(/coa|analisis|certificado|laboratorio|lote|prueba/)) return 'COA';
        if (text.match(/pedido|orden|envio|rastreo|donde viene|status|estatus/)) return 'ORDER';
        if (text.match(/manda|envia|whatsapp|whats|foto|imagen/)) return 'WHATSAPP_CONFIRM';
        return 'UNKNOWN';
    }

    /**
     * Inject "Ara" Personality (ElevenLabs tags + Slang)
     */
    private addPersonality(baseText: string, mood: 'positive' | 'neutral' | 'empathetic'): string {
        // Simple prefix/suffix injection for now. 
        // Can be expanded to use a template engine.

        let text = baseText;

        // Replace dry "Encontré" with friendlier starts
        if (text.startsWith('Encontré')) {
            const starts = [
                "¡Súper! Mira, encontré",
                "`[chuckle]` A ver... sí, aquí tengo",
                "Literal tengo justo esto:"
            ];
            text = text.replace('Encontré', starts[Math.floor(Math.random() * starts.length)]);
        }

        // Add closing fillers
        if (!text.endsWith('?')) {
            const ends = [
                " ¿Cómo ves?",
                " ¿Va?",
                " ¿Te late?"
            ];
            text += ends[Math.floor(Math.random() * ends.length)];
        }

        return text;
    }
}
