// Force sync script for Shopify metafields
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const { createClient } = require('@supabase/supabase-js');
const { syncClientCOAsToShopify } = require('./dist/services/shopifyService');

console.log('SUPABASE_URL:', process.env.SUPABASE_URL ? 'Set' : 'NOT SET');
console.log('SHOPIFY_ACCESS_TOKEN:', process.env.SHOPIFY_ACCESS_TOKEN ? 'Set' : 'NOT SET');

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function forceSync() {
    // Force sync for Bernardo Adlt (should clear his COAs in Shopify)
    console.log('Syncing Bernardo Adlt (badlt@extractoseum.com)...');
    const result1 = await syncClientCOAsToShopify(
        '8763363688620',
        'ce83d522-1126-4244-9f5e-49bbf9702b24',
        supabase
    );
    console.log('Bernardo sync result:', result1);

    // Also sync delta de la torre
    console.log('\nSyncing delta de la torre (bdelatorre8@gmail.com)...');
    const result2 = await syncClientCOAsToShopify(
        '8667263926444',
        '9eb92a90-164e-48d3-a57b-346c38c00c62',
        supabase
    );
    console.log('delta sync result:', result2);
}

forceSync().catch(console.error);
