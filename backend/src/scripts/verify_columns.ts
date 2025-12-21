import { supabase } from '../config/supabase';

async function verify() {
    console.log('Verifying orders columns...');
    const { data, error } = await supabase
        .from('orders')
        .select('id, customer_email')
        .limit(1);

    if (error) {
        console.error('VERIFICATION FAILED:', error.message);
    } else {
        console.log('VERIFICATION SUCCESS: Column customer_email exists.');
    }
}

verify();
