import { supabase } from '../config/supabase';

async function seedCOA() {
    console.log('🌱 Sembrando COA de prueba en Supabase...');

    const cleanValues = {
        public_token: 'live-test-123',
        product_sku: 'EUM-RSO-FULL',
        lab_name: 'KCA Laboratories',
        analysis_date: '2024-01-15',
        batch_id: 'RSO-2401-001',
        compliance_status: 'pass',
        thc_compliance_flag: true,
        cannabinoids: [
            { analyte: 'CBD', result_pct: '70.5', detected: true },
            { analyte: 'THC', result_pct: '0.9', detected: true },
            { analyte: 'CBG', result_pct: '2.5', detected: true }
        ]
    };

    const { data, error } = await supabase
        .from('coas')
        .insert([cleanValues])
        .select();

    if (error) {
        if (error.code === '23505') { // unique_violation
            console.log('⚠️ El COA "live-test-123" ya existe. No se duplicó.');
        } else {
            console.error('❌ Error al insertar:', error.message);
        }
    } else {
        console.log('✅ ¡COA de prueba insertado con éxito!');
        console.log('   Token: live-test-123');
        console.log('   ID:', data?.[0]?.id);
    }
}

seedCOA();
