
import { supabase } from '../config/supabase';

async function patch() {
    const ids = [
        "cbfc4223-1881-4c86-a3fa-b08a8d378617",
        "d2da3343-e608-4e7d-b39d-624c0491c89d",
        "e278aef2-4b30-428d-829f-ed4a9881406b"
    ];

    const facts = {
        personality: ['Directo', 'Frio', 'Potencial'],
        tags: ['Club_partner', 'Club_user', 'Gold_member', 'Shop', 'Vambi_imported', 'Heavy_gummy_user'],
        interests: ['Sour Extreme Gummies', 'Vape Pods'],
        action_plan: [
            {
                label: 'Enviar Cupón Recurrencia 15%',
                meta: 'ALTA CONVERSIÓN',
                action_type: 'coupon',
                payload: { discount: '15%', code: 'REFILL15' }
            },
            {
                label: 'Ofrecer Registro B2B',
                meta: 'INCREMENTA LTV',
                action_type: 'link',
                payload: { url: 'https://extractoseum.com/pages/b2b-login' }
            },
            {
                label: 'Invitar a Canna Club EUM',
                meta: 'FIDELIZACIÓN',
                action_type: 'link',
                payload: { url: 'https://extractoseum.com/pages/registro-cannaclub-eum-care' }
            },
            {
                label: 'Sugerir Compra de Análisis COA',
                meta: 'UPSELL',
                action_type: 'link',
                payload: { url: 'https://extractoseum.com/collections/analisis-coa' }
            }
        ]
    };

    const tags = ['CLUB_EUM_PLATINUM', 'WHOLESALE'];

    for (const id of ids) {
        // Try to update tags if column exists, and facts
        // First check if tags column exists by selecting it
        const { error: tagCheck } = await supabase.from('conversations').select('tags').eq('id', id).single();

        let updatePayload: any = { facts };
        if (!tagCheck) {
            updatePayload.tags = tags;
        } else {
            console.log('Tags column might not exist or verify failed, skipping tags update in favor of facts only if needed? No, I will try to update it.');
            // If tagCheck matches, it means column exists.
            updatePayload.tags = tags;
        }

        const { error } = await supabase
            .from('conversations')
            .update(updatePayload)
            .eq('id', id);

        if (error) {
            console.error(`Failed to update ${id}:`, error);
            // Fallback: maybe tags column is missing? Try updating only facts
            if (error.message.includes('tags')) {
                const { error: retryError } = await supabase
                    .from('conversations')
                    .update({ facts })
                    .eq('id', id);
                if (retryError) console.error(`Retry failed for ${id}:`, retryError);
                else console.log(`Updated facts ONLY for ${id}`);
            }
        } else {
            console.log(`Updated facts and tags for ${id}`);
        }
    }
}

patch();
