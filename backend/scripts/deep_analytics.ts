import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://vbnpcospodhwuzvxejui.supabase.co';
const supabaseKey = 'sb_secret_oe4yGQkr1fuvpcAL2uCbrQ_AkLxJOk4';

const supabase = createClient(supabaseUrl, supabaseKey);

async function deepAnalytics() {
    console.log('='.repeat(70));
    console.log('🔬 ANÁLISIS PROFUNDO DE DATOS');
    console.log('='.repeat(70));

    // 1. Verificar fechas de los datos
    console.log('\n📅 RANGO DE FECHAS DE LOS DATOS\n');

    // COA Scans - fecha más reciente
    const { data: latestScan } = await supabase
        .from('coa_scans')
        .select('created_at')
        .order('created_at', { ascending: false })
        .limit(1);

    const { data: oldestScan } = await supabase
        .from('coa_scans')
        .select('created_at')
        .order('created_at', { ascending: true })
        .limit(1);

    console.log('COA Scans:');
    console.log(`   Más antiguo: ${oldestScan?.[0]?.created_at || 'N/A'}`);
    console.log(`   Más reciente: ${latestScan?.[0]?.created_at || 'N/A'}`);

    // WhatsApp Messages - fecha más reciente
    const { data: latestMsg } = await supabase
        .from('whatsapp_messages')
        .select('created_at')
        .order('created_at', { ascending: false })
        .limit(1);

    const { data: oldestMsg } = await supabase
        .from('whatsapp_messages')
        .select('created_at')
        .order('created_at', { ascending: true })
        .limit(1);

    console.log('\nWhatsApp Messages:');
    console.log(`   Más antiguo: ${oldestMsg?.[0]?.created_at || 'N/A'}`);
    console.log(`   Más reciente: ${latestMsg?.[0]?.created_at || 'N/A'}`);

    // CRM Contacts
    const { data: latestContact } = await supabase
        .from('crm_contact_snapshots')
        .select('created_at, updated_at')
        .order('created_at', { ascending: false })
        .limit(1);

    const { data: oldestContact } = await supabase
        .from('crm_contact_snapshots')
        .select('created_at')
        .order('created_at', { ascending: true })
        .limit(1);

    console.log('\nCRM Contacts:');
    console.log(`   Más antiguo: ${oldestContact?.[0]?.created_at || 'N/A'}`);
    console.log(`   Más reciente: ${latestContact?.[0]?.created_at || 'N/A'}`);
    console.log(`   Última actualización: ${latestContact?.[0]?.updated_at || 'N/A'}`);

    // System Logs
    const { data: latestLog } = await supabase
        .from('system_logs')
        .select('created_at')
        .order('created_at', { ascending: false })
        .limit(1);

    console.log('\nSystem Logs:');
    console.log(`   Más reciente: ${latestLog?.[0]?.created_at || 'N/A'}`);

    // 2. Listar todas las tablas disponibles con conteos
    console.log('\n' + '─'.repeat(70));
    console.log('📊 CONTEO DE REGISTROS POR TABLA');
    console.log('─'.repeat(70));

    const tables = [
        'clients',
        'coas',
        'coa_scans',
        'pdf_downloads',
        'link_clicks',
        'crm_contact_snapshots',
        'crm_threads',
        'crm_inquiries',
        'whatsapp_messages',
        'system_logs',
        'ai_usage_logs',
        'users',
        'profiles',
        'sessions'
    ];

    for (const table of tables) {
        const { count, error } = await supabase
            .from(table)
            .select('*', { count: 'exact', head: true });

        if (error) {
            console.log(`   ${table.padEnd(30)} ❌ Error: ${error.message.substring(0, 30)}`);
        } else {
            console.log(`   ${table.padEnd(30)} ${count || 0}`);
        }
    }

    // 3. Actividad reciente en system_logs (para ver si el sistema está activo)
    console.log('\n' + '─'.repeat(70));
    console.log('📝 ÚLTIMOS 10 LOGS DEL SISTEMA');
    console.log('─'.repeat(70));

    const { data: recentLogs } = await supabase
        .from('system_logs')
        .select('created_at, category, event_type, severity')
        .order('created_at', { ascending: false })
        .limit(10);

    if (recentLogs) {
        recentLogs.forEach(log => {
            const date = new Date(log.created_at).toLocaleString('es-MX');
            console.log(`   ${date} | ${log.category?.padEnd(15)} | ${log.event_type}`);
        });
    }

    // 4. Verificar sesiones de usuarios
    console.log('\n' + '─'.repeat(70));
    console.log('👤 SESIONES DE USUARIOS ACTIVAS');
    console.log('─'.repeat(70));

    const { data: sessions, error: sessError } = await supabase
        .from('sessions')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(10);

    if (sessError) {
        console.log(`   ⚠️  Tabla sessions: ${sessError.message}`);
    } else if (sessions && sessions.length > 0) {
        console.log(`   Total sesiones recientes: ${sessions.length}`);
        sessions.forEach(s => {
            console.log(`   - ${new Date(s.created_at).toLocaleString('es-MX')}`);
        });
    } else {
        console.log('   No hay sesiones registradas');
    }

    // 5. Verificar si hay datos de OneSignal
    console.log('\n' + '─'.repeat(70));
    console.log('🔔 ONESIGNAL / PUSH DATA');
    console.log('─'.repeat(70));

    // Buscar cualquier tabla relacionada con push/onesignal
    const pushTables = ['push_subscriptions', 'onesignal_subscriptions', 'push_tokens', 'device_tokens'];
    for (const table of pushTables) {
        const { count, error } = await supabase
            .from(table)
            .select('*', { count: 'exact', head: true });

        if (!error) {
            console.log(`   ${table}: ${count} registros`);
        }
    }

    // Verificar en crm_contact_snapshots si hay player_ids de OneSignal
    const { data: contactsWithPush } = await supabase
        .from('crm_contact_snapshots')
        .select('onesignal_player_id')
        .not('onesignal_player_id', 'is', null);

    console.log(`   Contactos con OneSignal player_id: ${contactsWithPush?.length || 0}`);

    // 6. Análisis de usuarios únicos por diferentes métricas
    console.log('\n' + '─'.repeat(70));
    console.log('👥 ANÁLISIS DE USUARIOS/CONTACTOS');
    console.log('─'.repeat(70));

    // Contactos activos (con mensajes recientes)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const { data: activeContacts } = await supabase
        .from('crm_threads')
        .select('contact_id')
        .gte('updated_at', thirtyDaysAgo.toISOString());

    const uniqueActiveContacts = new Set(activeContacts?.map(c => c.contact_id) || []);
    console.log(`   Contactos activos (30 días): ${uniqueActiveContacts.size}`);

    // Threads abiertos
    const { count: openThreads } = await supabase
        .from('crm_threads')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'open');

    console.log(`   Threads abiertos: ${openThreads || 0}`);

    // 7. Verificar APK/Mobile específicamente
    console.log('\n' + '─'.repeat(70));
    console.log('📱 INDICADORES DE USO MÓVIL/APK');
    console.log('─'.repeat(70));

    // Scans desde mobile
    const { count: mobileScans } = await supabase
        .from('coa_scans')
        .select('*', { count: 'exact', head: true })
        .eq('device_type', 'mobile');

    console.log(`   Total scans desde mobile: ${mobileScans || 0}`);

    // User agents que podrían ser de la APK
    const { data: mobileUserAgents } = await supabase
        .from('coa_scans')
        .select('user_agent')
        .eq('device_type', 'mobile')
        .limit(10);

    if (mobileUserAgents && mobileUserAgents.length > 0) {
        console.log('\n   Ejemplos de User Agents móviles:');
        const uniqueUAs = [...new Set(mobileUserAgents.map(u => u.user_agent?.substring(0, 60)))];
        uniqueUAs.slice(0, 5).forEach(ua => {
            console.log(`     - ${ua}...`);
        });
    }

    // 8. Verificar Google Analytics o servicios externos
    console.log('\n' + '─'.repeat(70));
    console.log('⚠️  SERVICIOS EXTERNOS NO CONFIGURADOS');
    console.log('─'.repeat(70));
    console.log(`
   Para tracking de:

   1. INSTALACIONES DE APK:
      - Necesitas Google Play Console (si está en Play Store)
      - O Firebase Analytics integrado en la app
      - Actualmente: NO HAY tracking de instalaciones

   2. EXTRACTOSEUM.COM (Landing):
      - Necesitas Google Analytics en la landing
      - Actualmente: NO HAY tracking en la landing

   3. COA.EXTRACTOSEUM.COM:
      - ✅ Tienes tracking propio con coa_scans
      - ✅ Tienes system_logs
      - Pero parece que no hay actividad reciente de scans
`);

    console.log('\n' + '='.repeat(70));
    console.log('FIN DEL ANÁLISIS');
    console.log('='.repeat(70));
}

deepAnalytics().catch(console.error);
