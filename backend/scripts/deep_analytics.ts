
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables from the parent directory's .env file
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase credentials in .env');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function generateDeepReport() {
    console.log('📊 Generando Reporte de "Verdad" (Deep Analytics)...');
    console.log('----------------------------------------------------');

    // 1. Fetch raw data (Last 48 hours for relevant deployed window)
    const { data: scans, error } = await supabase
        .from('coa_scans')
        .select('*')
        .order('scanned_at', { ascending: false })
        .limit(500); // Analyze last 500 interactions

    if (error) {
        console.error('Error fetching data:', error);
        return;
    }

    if (!scans || scans.length === 0) {
        console.log('⚠️ No hay datos recientes.');
        return;
    }

    // 2. Aggregations
    const totalScans = scans.length;
    const uniqueIPs = new Set(scans.map(s => s.ip_hash));
    const uniqueSessions = new Set(scans.map(s => s.session_id));

    // Devices
    const devices: { [key: string]: number } = {};
    scans.forEach(s => {
        const key = `${s.device_type} (${s.os})`;
        devices[key] = (devices[key] || 0) + 1;
    });

    // Geo
    const geo: { [key: string]: number } = {};
    scans.forEach(s => {
        const key = s.city ? `${s.city}, ${s.country}` : 'Desconocido/Oculto';
        geo[key] = (geo[key] || 0) + 1;
    });

    // Access Type
    const access: { [key: string]: number } = {};
    scans.forEach(s => {
        access[s.access_type] = (access[s.access_type] || 0) + 1;
    });

    // 3. Print Report
    console.log(`\n🟢 TRÁFICO TOTAL (Muestra: Últimos ${totalScans} eventos)`);
    console.log(`   • Vistas Totales:    ${totalScans}`);
    console.log(`   • Visitantes Únicos: ${uniqueIPs.size} (Basado en IP Hash)`);
    console.log(`   • Sesiones Reales:   ${uniqueSessions.size}`);

    console.log(`\n📱 DISPOSITIVOS (La "Huella Digital")`);
    Object.entries(devices).sort(([, a], [, b]) => b - a).forEach(([device, count]) => {
        console.log(`   • ${device}: ${count}`);
    });

    console.log(`\n🌍 GEOGRAFÍA (¿De dónde vienen?)`);
    Object.entries(geo).sort(([, a], [, b]) => b - a).forEach(([place, count]) => {
        console.log(`   • ${place}: ${count}`);
    });

    console.log(`\n🔗 CAMINOS DE ENTRADA`);
    Object.entries(access).sort(([, a], [, b]) => b - a).forEach(([type, count]) => {
        console.log(`   • ${type}: ${count}`);
    });

    console.log(`\n🕒 ACTIVIDAD RECIENTE (Últimos 5)`);
    scans.slice(0, 5).forEach(s => {
        console.log(`   [${new Date(s.scanned_at).toLocaleTimeString()}] ${s.device_type} desde ${s.city || 'X'} -> ${s.access_type}`);
    });

    console.log('\n✅ VERIFICACIÓN DE REALIDAD:');
    if (uniqueIPs.size > 1) {
        console.log('   -> Tráfico Orgánico DETECTADO (Múltiples IPs distintas).');
    } else {
        console.log('   -> Solo tráfico local/interno detectado.');
    }
}

generateDeepReport();
