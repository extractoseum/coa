import { supabase } from '../config/supabase';

async function testConnection() {
    console.log('🔌 Probando conexión a Supabase...');

    try {
        // Intentar leer la tabla 'coas'
        const { count, error } = await supabase
            .from('coas')
            .select('*', { count: 'exact', head: true });

        if (error) {
            if (error.code === '42P01') { // undefined_table
                console.error('❌ Conexión exitosa, pero la tabla "coas" NO existe.');
                console.error('   👉 Asegúrate de ejecutar el script "schema.sql" en el Editor SQL de Supabase.');
            } else if (error.code === 'PGRST301') { // JWT expired o inválido, a veces pasa con claves malas
                console.error('❌ Error de Permisos/Auth:', error.message);
                console.error('   👉 Verifica que usaste la "service_role" key y no la "anon".');
            } else {
                console.error('❌ Error general de conexión:', error.message);
                console.error('   👉 Verifica tu SUPABASE_URL y KEY en el archivo .env');
            }
            process.exit(1);
        }

        console.log('✅ ¡Conexión Exitosa!');
        console.log(`   La tabla "coas" existe y es accesible. (Filas actuales: ${count})`);

    } catch (err: any) {
        console.error('❌ Error inesperado:', err.message);
        process.exit(1);
    }
}

testConnection();
