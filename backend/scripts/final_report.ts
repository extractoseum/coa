import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://vbnpcospodhwuzvxejui.supabase.co';
const supabaseKey = 'sb_secret_oe4yGQkr1fuvpcAL2uCbrQ_AkLxJOk4';

const supabase = createClient(supabaseUrl, supabaseKey);

async function finalReport() {
    console.log('═'.repeat(70));
    console.log('📊 REPORTE FINAL DE MÉTRICAS - COA VIEWER 2.0');
    console.log('═'.repeat(70));
    console.log(`Generado: ${new Date().toLocaleString('es-MX')}\n`);

    // Obtener rango real de fechas de cada tabla
    console.log('📅 RANGOS DE FECHAS REALES EN LA BASE DE DATOS\n');

    // COA Scans
    const { data: scanDates } = await supabase.rpc('get_date_range', { table_name: 'coa_scans' }).maybeSingle();

    // Hacerlo manualmente
    const { data: allScans } = await supabase
        .from('coa_scans')
        .select('created_at')
        .order('created_at', { ascending: true });

    if (allScans && allScans.length > 0) {
        const oldest = new Date(allScans[0].created_at);
        const newest = new Date(allScans[allScans.length - 1].created_at);
        console.log('COA Scans:');
        console.log(`   Rango: ${oldest.toLocaleDateString('es-MX')} → ${newest.toLocaleDateString('es-MX')}`);
        console.log(`   Total: ${allScans.length} scans`);

        // Ver distribución por mes
        const byMonth: Record<string, number> = {};
        allScans.forEach(s => {
            const month = new Date(s.created_at).toLocaleDateString('es-MX', { year: 'numeric', month: 'short' });
            byMonth[month] = (byMonth[month] || 0) + 1;
        });
        console.log('   Por mes:');
        Object.entries(byMonth).forEach(([month, count]) => {
            console.log(`      ${month}: ${count}`);
        });
    }

    // WhatsApp Messages
    const { data: allMessages } = await supabase
        .from('whatsapp_messages')
        .select('created_at, timestamp')
        .order('created_at', { ascending: true });

    if (allMessages && allMessages.length > 0) {
        console.log('\nWhatsApp Messages:');
        const oldest = new Date(allMessages[0].created_at || allMessages[0].timestamp);
        const newest = new Date(allMessages[allMessages.length - 1].created_at || allMessages[allMessages.length - 1].timestamp);
        console.log(`   Rango: ${oldest.toLocaleDateString('es-MX')} → ${newest.toLocaleDateString('es-MX')}`);
        console.log(`   Total: ${allMessages.length} mensajes`);

        // Mensajes por día (últimos 7 días)
        const now = new Date();
        const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        const recentMsgs = allMessages.filter(m => {
            const date = new Date(m.created_at || m.timestamp);
            return date >= sevenDaysAgo;
        });
        console.log(`   Últimos 7 días: ${recentMsgs.length} mensajes`);
    }

    // Telemetry/PageViews desde system_logs
    console.log('\n' + '─'.repeat(70));
    console.log('👁️ ACTIVIDAD EN COA.EXTRACTOSEUM.COM (PageViews)');
    console.log('─'.repeat(70));

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const { data: pageViews } = await supabase
        .from('system_logs')
        .select('created_at, payload')
        .eq('category', 'telemetry')
        .eq('event_type', 'PageView')
        .gte('created_at', sevenDaysAgo.toISOString());

    console.log(`\nPageViews (últimos 7 días): ${pageViews?.length || 0}`);

    if (pageViews && pageViews.length > 0) {
        // Agrupar por día
        const byDay: Record<string, number> = {};
        const paths: Record<string, number> = {};

        pageViews.forEach(pv => {
            const day = new Date(pv.created_at).toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric', month: 'short' });
            byDay[day] = (byDay[day] || 0) + 1;

            const path = pv.payload?.path || pv.payload?.url || 'unknown';
            paths[path] = (paths[path] || 0) + 1;
        });

        console.log('\nPor día:');
        Object.entries(byDay).forEach(([day, count]) => {
            const bar = '█'.repeat(Math.min(Math.ceil(count / 2), 30));
            console.log(`   ${day.padEnd(15)} ${bar} ${count}`);
        });

        console.log('\nTop páginas visitadas:');
        Object.entries(paths)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
            .forEach(([path, count]) => {
                console.log(`   ${count.toString().padStart(4)} - ${path.substring(0, 50)}`);
            });
    }

    // Sessions activas
    console.log('\n' + '─'.repeat(70));
    console.log('👤 SESIONES DE USUARIOS');
    console.log('─'.repeat(70));

    const { data: sessions } = await supabase
        .from('sessions')
        .select('created_at, user_id')
        .gte('created_at', sevenDaysAgo.toISOString());

    console.log(`\nSesiones (últimos 7 días): ${sessions?.length || 0}`);

    if (sessions && sessions.length > 0) {
        const uniqueUsers = new Set(sessions.map(s => s.user_id));
        console.log(`Usuarios únicos: ${uniqueUsers.size}`);
    }

    // CRM Activity
    console.log('\n' + '─'.repeat(70));
    console.log('💬 ACTIVIDAD CRM/WHATSAPP');
    console.log('─'.repeat(70));

    const { data: contacts } = await supabase
        .from('crm_contact_snapshots')
        .select('id, display_name, phone, last_message_at, created_at')
        .order('last_message_at', { ascending: false, nullsFirst: false })
        .limit(20);

    console.log(`\nÚltimos 20 contactos activos:`);
    contacts?.forEach(c => {
        const lastMsg = c.last_message_at ? new Date(c.last_message_at).toLocaleDateString('es-MX') : 'N/A';
        console.log(`   ${(c.display_name || c.phone || 'Sin nombre').substring(0, 25).padEnd(25)} - Último msg: ${lastMsg}`);
    });

    // Push Tokens
    console.log('\n' + '─'.repeat(70));
    console.log('📱 DISPOSITIVOS MÓVILES / APK');
    console.log('─'.repeat(70));

    const { data: pushTokens } = await supabase
        .from('push_tokens')
        .select('*');

    console.log(`\nPush tokens registrados: ${pushTokens?.length || 0}`);

    if (pushTokens && pushTokens.length > 0) {
        pushTokens.forEach(t => {
            console.log(`   - Creado: ${new Date(t.created_at).toLocaleDateString('es-MX')} | Token: ${t.token?.substring(0, 30)}...`);
        });
    }

    // Resumen de lo que NO tenemos
    console.log('\n' + '═'.repeat(70));
    console.log('⚠️  LIMITACIONES ACTUALES DEL TRACKING');
    console.log('═'.repeat(70));
    console.log(`
1. INSTALACIONES DE APK:
   ❌ NO HAY forma de saber cuántas personas instalaron la APK
   ➡️  Solución: Integrar Firebase Analytics o usar Google Play Console

2. EXTRACTOSEUM.COM (Landing Page):
   ❌ NO HAY tracking configurado para la landing page
   ➡️  Solución: Agregar Google Analytics o tracking similar

3. VISITANTES ÚNICOS EN COA.EXTRACTOSEUM.COM:
   ⚠️  Tenemos PageViews en system_logs pero no visitantes únicos
   ➡️  El tracking de coa_scans parece estar desactivado o no funcionando

4. ACTIVIDAD DE USUARIOS:
   ✅ Tenemos sessions: ${sessions?.length || 0} en 7 días
   ✅ Tenemos PageViews: ${pageViews?.length || 0} en 7 días
   ✅ Tenemos ${contacts?.length || 0} contactos CRM activos

`);

    // Recomendaciones
    console.log('═'.repeat(70));
    console.log('💡 RECOMENDACIONES');
    console.log('═'.repeat(70));
    console.log(`
1. Para tracking de instalaciones de APK:
   - Si usas Google Play: Google Play Console tiene analytics
   - Si distribuyes APK directamente: Implementar Firebase Analytics

2. Para tracking de extractoseum.com:
   - Agregar Google Analytics 4 (GA4) al HTML de la landing

3. Para mejorar métricas en coa.extractoseum.com:
   - Verificar que el tracking de coa_scans esté activo
   - El sistema actual registra ${pageViews?.length || 0} pageviews esta semana

4. Dashboard actual:
   - Los datos que ves en tu dashboard probablemente vienen de:
     * system_logs (telemetría)
     * sessions (logins)
     * whatsapp_messages (CRM)
   - NO hay datos de instalaciones de APK
`);

    console.log('═'.repeat(70));
}

finalReport().catch(console.error);
