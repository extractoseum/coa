
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

    private constructor() { }

    public static getInstance(): BehaviorService {
        if (!BehaviorService.instance) {
            BehaviorService.instance = new BehaviorService();
        }
        return BehaviorService.instance;
    }

    /**
     * Analyzes a behavioral event and decides if a reaction (notification) is needed.
     * Uses Generative AI to craft specific messages ("Perfect Clickbait").
     */
    public async analyzeAndReact(context: BehavioralContext): Promise<void> {
        try {
            console.log(`[BehaviorService] Analyzing event: ${context.event_type} for ${context.user_identifier || 'Anonymous'}`);

            // 1. Configurable Triggers
            // Only react to high-intent events for now
            const highIntentEvents = ['purchase', 'shop', 'add_to_cart_intent', 'add_to_cart', 'purchase_success'];
            if (!highIntentEvents.includes(context.event_type)) {
                return;
            }

            // 1.5 PRODUCT ENRICHMENT (Contexto Amplio)
            let productContext: ProductContext[] = [];

            // Try to find product details in DB if items names are present
            const items = context.metadata?.items || []; // Array of strings (names)
            const singleItem = context.metadata?.item_name || context.metadata?.destination; // Fallback

            const searchTerms = items.length > 0 ? items : (singleItem ? [singleItem] : []);

            if (searchTerms.length > 0) {
                // Approximate search for the first few items
                for (const term of searchTerms.slice(0, 3)) {
                    // Clean term for search (remove sizing etc if possible, but keep simple for now)
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

            // Fallback if no specific products found but we have generic metabolic info
            const contextString = productContext.length > 0
                ? JSON.stringify(productContext)
                : "Product details not found in DB, infer from metadata.";

            console.log(`[BehaviorService] Context Loaded: ${productContext.length} products found.`);

            // 2. AI Generation - "The Perfect Clickbait & Empathy Engine"
            const uniqueId = context.user_identifier || 'anonymous';
            let systemPrompt = '';
            let userPrompt = '';

            if (context.event_type === 'purchase_success') {
                // STRATEGY: RETENTION & LOYALTY (Post-Purchase)
                // Goal: Envelop the client with value (Tips, Reviews, Usage Guide)
                systemPrompt = `
                    You are the "Master Herbalist" and "Community Manager" for Extractos EUM.
                    Your goal is to reassure the user after a purchase and make them feel part of an exclusive club.
                    Tone: Warm, knowledgeable, slightly esoteric/scientific but accessible.
                    Content: Provide a specific "Pro Tip" about the product OR share a short snippet of a stellar review.
                    Max Length: 20 words.
                    Language: Spanish (Mexico).
                `;
                userPrompt = `
                    User '${uniqueId}' just completed a purchase of: ${JSON.stringify(context.metadata)}.
                    
                    PRODUCT CONTEXT (Use this to personalize the tip):
                    ${contextString}

                    Generate a post-purchase message. 
                    - Map the product_type/tags to a specific meaningful tip.
                    - If "Gummies" or "Edibles" -> Tip about digestion/fats.
                    - If "Vapes" -> Tip about heat/storage.
                    - If "Tinctures" -> Tip about sublingual absorption time.
                    Make them feel they made the best decision.
                `;
            } else {
                // STRATEGY: ACQUISITION (Pre-Purchase / Recovery)
                // Goal: FOMO, Curiosity
                systemPrompt = `
                    You are the "Empathetic Sales Cortex" for Extractos EUM.
                    Your goal is to generate a SHORT, HIGH-CONVERSION notification message (Push/SMS/Email).
                    Tone: Empathetic, exclusive, slightly mysterious ("Clickbait" via curiosity).
                    Max Length: 15 words.
                    Language: Spanish (Mexico).
                `;

                userPrompt = `
                    User '${uniqueId}' just showed high intent by clicking '${context.event_type}'.
                    
                    PRODUCT CONTEXT (What they almost bought):
                    ${contextString}

                    Generate a notification message to bring them back.
                    - Mention a specific characteristic of the product found in the context (Effect, Flavor, Type).
                    - Use FOMO.
                    Don't say "Buy now".
                `;
            }

            const aiResponse = await AIService.getInstance().generateText(
                systemPrompt,
                userPrompt,
                'gpt-4o' // High intelligence model for copywriting
            );

            const generatedMessage = aiResponse.content?.replace(/"/g, '') || "¡No te quedes sin el tuyo!";

            // 3. Log the "Reaction" (Simulate sending)
            // In a real scenario, this would call pushService or emailService
            console.log(`\n📢 [ACTIVE REFLEX] Triggered for ${uniqueId}`);
            console.log(`   Event: ${context.event_type}`);
            console.log(`   🤖 AI Generated Alert: "${generatedMessage}"`);

            // 4. Persist the generated insight for CRM
            await supabase.from('browsing_events').insert({
                event_type: 'system_reaction',
                handle: uniqueId,
                metadata: {
                    trigger_event: context.event_type,
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
