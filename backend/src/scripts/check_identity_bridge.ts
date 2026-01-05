/**
 * Check identity bridge between browsing events and clients
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function test() {
    // Get emails that have browsing events
    const { data: events } = await supabase
        .from('browsing_events')
        .select('handle')
        .not('handle', 'is', null)
        .limit(100);

    const uniqueEmails = [...new Set(events?.map(e => e.handle) || [])];
    console.log('=== EMAILS WITH BROWSING EVENTS ===');
    console.log('Total unique:', uniqueEmails.length);
    console.log('Sample:', uniqueEmails.slice(0, 5));

    // Check if any of these emails exist in clients
    console.log('\n=== CHECKING IF EMAILS EXIST IN CLIENTS ===');
    let matchCount = 0;

    for (const email of uniqueEmails.slice(0, 10)) {
        const { data: client } = await supabase
            .from('clients')
            .select('id, phone, email')
            .ilike('email', email)
            .maybeSingle();

        if (client) {
            matchCount++;
            console.log(`✅ ${email} -> phone: ${client.phone}`);
        } else {
            console.log(`❌ ${email} -> NOT FOUND in clients`);
        }
    }

    console.log(`\nMatched: ${matchCount}/${Math.min(uniqueEmails.length, 10)}`);

    // Now check conversations for matched clients
    console.log('\n=== CONVERSATIONS FOR CLIENTS WITH EVENTS ===');
    for (const email of uniqueEmails.slice(0, 5)) {
        const { data: client } = await supabase
            .from('clients')
            .select('id, phone, email')
            .ilike('email', email)
            .maybeSingle();

        if (client && client.phone) {
            const phone10 = client.phone.replace(/\D/g, '').slice(-10);

            // Find conversation by phone
            const { data: conv } = await supabase
                .from('conversations')
                .select('id, contact_handle')
                .ilike('contact_handle', `%${phone10}`)
                .maybeSingle();

            if (conv) {
                console.log(`${email} -> Conv found: ${conv.contact_handle}`);
            } else {
                console.log(`${email} -> No conversation for phone ${phone10}`);
            }
        }
    }
}

test().catch(console.error);
