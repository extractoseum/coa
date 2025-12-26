
import { AIService } from './aiService';
import { supabase } from '../config/supabase';

interface BehavioralContext {
    event_type: string; // 'purchase_intent', 'view_item', etc.
    metadata: any;
    user_identifier?: string; // Email, Phone, or Session ID
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
            const highIntentEvents = ['purchase', 'shop', 'add_to_cart_intent', 'purchase_success'];
            if (!highIntentEvents.includes(context.event_type)) {
                return;
            }

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
                    Generate a post-purchase message. 
                    - If it's gummies/edibles -> Tip about bioavailability (eat with fats).
                    - If it's vapes -> Tip about voltage/temperature.
                    - If unsure -> Insight about the "Entourage Effect".
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
                    User '${uniqueId}' just showed high intent by clicking '${context.event_type}' on product: ${JSON.stringify(context.metadata)}.
                    Generate a notification message to bring them back to complete the purchase.
                    Don't say "Buy now". Focus on benefit or fear of missing out (FOMO).
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
