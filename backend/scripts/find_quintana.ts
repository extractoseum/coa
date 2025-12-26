
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function findQuintana() {
    console.log('🕵️ Buscando rastro de "Quintana Roo" en la base de datos...');

    // Search by Region
    const { data: regionMatches, error: err1 } = await supabase
        .from('coa_scans')
        .select('*')
        .ilike('region', '%Quintana%')
        .limit(5);

    // Search by City (common cities)
    const { data: cityMatches, error: err2 } = await supabase
        .from('coa_scans')
        .select('*')
        .or('city.ilike.%Cancun%,city.ilike.%Playa%,city.ilike.%Tulum%')
        .limit(5);

    if (regionMatches && regionMatches.length > 0) {
        console.log(`\n✅ Encontrado por Región (${regionMatches.length}):`);
        regionMatches.forEach(s => console.log(`   - [${s.scanned_at}] ${s.city}, ${s.region} (${s.ip_address})`));
    } else {
        console.log(`\n❌ No encontrado por Región "Quintana".`);
    }

    if (cityMatches && cityMatches.length > 0) {
        console.log(`\n✅ Encontrado por Ciudad (${cityMatches.length}):`);
        cityMatches.forEach(s => console.log(`   - [${s.scanned_at}] ${s.city}, ${s.region} (${s.ip_address})`));
    } else {
        console.log(`\n❌ No encontrado por Ciudades clave.`);
    }

    // Checking 'unknown' or Null regions for potential candidates
    const { count } = await supabase
        .from('coa_scans')
        .select('*', { count: 'exact', head: true })
        .is('region', null);

    console.log(`\n⚠️ Hay ${count} escaneos con Región DESCONOCIDA (null) que podrían ser ellos.`);
}

findQuintana();
