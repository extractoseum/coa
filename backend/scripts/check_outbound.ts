
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function checkOutboundTraffic() {
    console.log('🔗 Verificando Tráfico Saliente (COA Viewer -> Shopify)...');

    const { data: clicks, error } = await supabase
        .from('link_clicks')
        .select('*')
        .order('clicked_at', { ascending: false })
        .limit(10);

    if (error) {
        console.error('Error:', error);
        return;
    }

    if (!clicks || clicks.length === 0) {
        console.log('⚠️ No hay clicks salientes recientes registrados.');
        return;
    }

    console.log(`✅ Últimos ${clicks.length} clicks hacia la tienda:`);
    clicks.forEach(c => {
        console.log(`[${new Date(c.clicked_at).toLocaleTimeString()}] Tipo: ${c.link_type} | URL: ${c.link_url} | IP Hash: ${c.ip_hash.substring(0, 6)}...`);
    });
}

checkOutboundTraffic();
