import { supabase } from './config/supabase';

async function deepSearchClient() {
    const targetEmail = 'erick@necte.mx';
    const targetShopifyId = '8667323760812';

    console.log(`--- Deep Search for Client ---`);
    console.log(`Email keyword: ${targetEmail}`);
    console.log(`Shopify ID keyword: ${targetShopifyId}`);

    // 1. Search by ILIKE (case insensitive) for email
    const { data: byEmail } = await supabase
        .from('clients')
        .select('*')
        .ilike('email', `%${targetEmail}%`);

    console.log(`\nMatches by Email ILIKE: ${byEmail?.length || 0}`);
    byEmail?.forEach(c => console.log(`- ID: ${c.id}, Email: [${c.email}], ShopifyID: [${c.shopify_customer_id}]`));

    // 2. Search for any client with the Shopify ID
    const { data: byShopifyId } = await supabase
        .from('clients')
        .select('*')
        .eq('shopify_customer_id', targetShopifyId);

    console.log(`\nMatches by Shopify ID: ${byShopifyId?.length || 0}`);
    byShopifyId?.forEach(c => console.log(`- ID: ${c.id}, Email: [${c.email}], ShopifyID: [${c.shopify_customer_id}]`));

    // 3. Search for phone number (Alan Martinez phone is 81 1077 0703)
    const { data: byPhone } = await supabase
        .from('clients')
        .select('*')
        .ilike('phone', `%1077%`);

    console.log(`\nMatches by partial Phone (1077): ${byPhone?.length || 0}`);
    byPhone?.forEach(c => console.log(`- ID: ${c.id}, Email: [${c.email}], Phone: [${c.phone}]`));

    // 4. List ALL clients if total count is small (to see if there's any corruption)
    const { count } = await supabase.from('clients').select('*', { count: 'exact', head: true });
    console.log(`\nTotal clients in DB: ${count}`);

    if (count !== null && count < 100) {
        const { data: allClients } = await supabase.from('clients').select('id, email, shopify_customer_id').limit(100);
        console.log('Listing some clients for manual check:');
        allClients?.forEach(c => {
            if (c.email.includes('erick') || c.email.includes('necte')) {
                console.log(`>> POTENTIAL: [${c.email}] ID: ${c.id}`);
            }
        });
    }
}

deepSearchClient();
