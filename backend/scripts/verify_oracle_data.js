
const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../.env') });

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function verify() {
    console.log('Verifying Oracle Data...');

    // Check Predictions
    const { data: predictions, error: predError, count: predCount } = await supabase
        .from('restock_predictions')
        .select('*', { count: 'exact', head: true });

    if (predError) {
        console.error('Error checking predictions:', predError.message);
    } else {
        console.log(`✅ Restock Predictions Count: ${predCount}`);
    }

    // Check Profiles
    const { data: profiles, error: profError, count: profCount } = await supabase
        .from('product_consumption_profiles')
        .select('*', { count: 'exact', head: true });

    if (profError) {
        console.error('Error checking profiles:', profError.message);
    } else {
        console.log(`✅ Consumption Profiles Count: ${profCount}`);
    }
}

verify();
