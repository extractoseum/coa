
import { AIService } from './aiService';
import { supabase } from '../config/supabase';

interface BehavioralContext {
    event_type: string; // 'purchase_intent', 'view_item', etc.
    metadata: any;
    user_identifier?: string; // Email, Phone, or Session ID
}

// Minimal Interface for Product Context
interface ProductContext {
    title: string;
    product_type: string;
    tags: string[];
}

export class BehaviorService {
    private static instance: BehaviorService;

    // Aggregation Buffer: Map<userId, { timer: NodeJS.Timeout, events: BehavioralContext[] }>
    private buffers: Map<string, { timer: NodeJS.Timeout, events: BehavioralContext[] }> = new Map();
    // 60-second "Silence Window" to aggregate bursts of activity
    private readonly DEBOUNCE_MS = 1000 * 60;

    private constructor() { }

    public static getInstance(): BehaviorService {
        if (!BehaviorService.instance) {
            BehaviorService.instance = new BehaviorService();
        }
        return BehaviorService.instance;
    }

    /**
     * Public entry point. Buffers events to prevent spam.
     */
    public async analyzeAndReact(context: BehavioralContext): Promise<void> {
        const uniqueId = context.user_identifier || 'anonymous';

        // 1. Configurable Triggers
        const highIntentEvents = ['purchase', 'shop', 'add_to_cart_intent', 'add_to_cart', 'purchase_success'];
        if (!highIntentEvents.includes(context.event_type)) {
            return;
        }

        // 2. Add to Buffer
        console.log(`[BehaviorService] Buffering event '${context.event_type}' for ${uniqueId}`);

        if (this.buffers.has(uniqueId)) {
            const buffer = this.buffers.get(uniqueId)!;
            clearTimeout(buffer.timer); // Reset "silence" timer (debounce)
            buffer.events.push(context);

            // Set new timer
            buffer.timer = setTimeout(() => this.processBuffer(uniqueId), this.DEBOUNCE_MS);
        } else {
            // New Buffer
            this.buffers.set(uniqueId, {
                events: [context],
                timer: setTimeout(() => this.processBuffer(uniqueId), this.DEBOUNCE_MS)
            });
        }
    }

    /**
     * Process the buffered events for a user
     */
    private async processBuffer(userId: string) {
        if (!this.buffers.has(userId)) return;

        const { events } = this.buffers.get(userId)!;
        this.buffers.delete(userId); // Clear buffer immediately to allow new batches

        try {
            console.log(`[BehaviorService] Processing batch for ${userId}: ${events.length} events.`);

            // Determine primary intent (e.g. if purchase_success exists, that dictates the mood)
            const hasPurchase = events.some(e => e.event_type === 'purchase_success');
            const primaryContext = hasPurchase
                ? events.find(e => e.event_type === 'purchase_success')!
                : events[events.length - 1]; // Default to most recent for event type

            await this.generateAggregatedReaction(userId, primaryContext.event_type, events);

        } catch (error) {
            console.error(`[BehaviorService] Batch processing failed for ${userId}:`, error);
        }
    }

    /**
     * AI Generation with Multi-Product Context
     */
    private async generateAggregatedReaction(uniqueId: string, eventType: string, events: BehavioralContext[]) {
        try {
            // 1.5 PRODUCT ENRICHMENT (Contexto Amplio Multi-Producto)
            let productContext: ProductContext[] = [];

            // Collect all items from all events
            const allItemNames: string[] = [];
            events.forEach(e => {
                if (e.metadata?.items) allItemNames.push(...e.metadata.items);
                if (e.metadata?.item_name) allItemNames.push(e.metadata.item_name);
                if (e.metadata?.destination) allItemNames.push(e.metadata.destination);
            });

            // De-duplicate names and search
            const uniqueNames = [...new Set(allItemNames)];

            if (uniqueNames.length > 0) {
                for (const term of uniqueNames.slice(0, 5)) {
                    const cleanTerm = term.split(' - ')[0].trim();

                    const { data: product } = await supabase
                        .from('products')
                        .select('title, product_type, tags')
                        .ilike('title', `%${cleanTerm}%`)
                        .limit(1)
                        .maybeSingle();

                    if (product) {
                        productContext.push({
                            title: product.title,
                            product_type: product.product_type,
                            tags: product.tags || []
                        });
                    }
                }
            }

            const contextString = productContext.length > 0
                ? JSON.stringify(productContext)
                : "Product details not found in DB, infer from metadata.";

            console.log(`[BehaviorService] Aggregated Context: ${productContext.length} products found for ${uniqueId}.`);

            // 2. AI Generation - "The Perfect Clickbait & Empathy Engine"
            let systemPrompt = '';
            let userPrompt = '';

            if (eventType === 'purchase_success') {
                // STRATEGY: RETENTION & LOYALTY (Post-Purchase)
                systemPrompt = `
                    You are the "Master Herbalist" and "Community Manager" for Extractos EUM.
                    Your goal is to reassure the user after a purchase and make them feel part of an exclusive club.
                    Tone: Warm, knowledgeable, slightly esoteric/scientific but accessible.
                    Content: Provide a single cohesive "Pro Tip" that applies to the products bought.
                    Max Length: 25 words.
                    Language: Spanish (Mexico).
                `;
                userPrompt = `
                    User '${uniqueId}' just purchased several items: ${JSON.stringify(uniqueNames)}.
                    
                    PRODUCT CONTEXT (Use this to personalize the tip):
                    ${contextString}

                    Generate ONE post-purchase message summarizing a tip for these items.
                    - If mixed items, find a common theme (e.g. "Storage" or "Dosing").
                    - Make them feel they made the best decision.
                `;
            } else {
                // STRATEGY: ACQUISITION (Pre-Purchase / Recovery / Add to Cart)
                systemPrompt = `
                    You are the "Empathetic Sales Cortex" for Extractos EUM.
                    Your goal is to generate a SHORT, HIGH-CONVERSION notification message.
                    Tone: Empathetic, exclusive, slightly mysterious ("Clickbait" via curiosity).
                    Max Length: 20 words.
                    Language: Spanish (Mexico).
                `;

                userPrompt = `
                    User '${uniqueId}' has been active and interested in: ${JSON.stringify(uniqueNames)}.
                    
                    PRODUCT CONTEXT:
                    ${contextString}

                    Generate ONE notification message to bring them back.
                    - Synthesize the interest (e.g. "Seems you are looking for relaxation...").
                    - If multiple products, mention the most premium one or the category.
                    - Use FOMO. Don't say "Buy now".
                `;
            }

            const aiResponse = await AIService.getInstance().generateText(
                systemPrompt,
                userPrompt,
                'gpt-4o' // High intelligence model for copywriting
            );

            const generatedMessage = aiResponse.content?.replace(/"/g, '') || "¡No te quedes sin el tuyo!";

            // 3. Log the "Reaction"
            console.log(`\n📢 [AGGREGATED REFLEX] Triggered for ${uniqueId}`);
            console.log(`   Event Type: ${eventType} (from ${events.length} event batch)`);
            console.log(`   🤖 AI Generated Alert: "${generatedMessage}"`);

            // 4. Persist the generated insight for CRM
            await supabase.from('browsing_events').insert({
                event_type: 'system_reaction',
                handle: uniqueId,
                metadata: {
                    trigger_event: eventType, // e.g., 'add_to_cart'
                    batch_size: events.length,
                    product_context: productContext, // Save the enriched context for debugging
                    generated_message: generatedMessage,
                    ai_model: 'gpt-4o'
                },
                created_at: new Date().toISOString()
            });

        } catch (error) {
            console.error('[BehaviorService] Analysis failed:', error);
        }
    }
}
