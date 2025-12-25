import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://vbnpcospodhwuzvxejui.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'sb_secret_oe4yGQkr1fuvpcAL2uCbrQ_AkLxJOk4';

const supabase = createClient(supabaseUrl, supabaseKey);

async function generateReport() {
    console.log('='.repeat(70));
    console.log('📊 REPORTE DE ANALYTICS - COA VIEWER 2.0');
    console.log('='.repeat(70));
    console.log(`Fecha de generación: ${new Date().toLocaleString('es-MX')}`);
    console.log('');

    // Fechas para filtros
    const now = new Date();
    const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const oneMonthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    // =====================================================================
    // 1. INSTALACIONES DE APK / REGISTROS DE DISPOSITIVOS PUSH
    // =====================================================================
    console.log('\n' + '─'.repeat(70));
    console.log('📱 INSTALACIONES DE APK / DISPOSITIVOS REGISTRADOS');
    console.log('─'.repeat(70));

    // Verificar tabla push_subscriptions
    const { data: pushDevices, error: pushError } = await supabase
        .from('push_subscriptions')
        .select('*');

    if (pushError) {
        console.log('⚠️  Tabla push_subscriptions no existe o error:', pushError.message);
    } else {
        console.log(`Total dispositivos registrados para push: ${pushDevices?.length || 0}`);

        // Dispositivos registrados esta semana
        const recentPush = pushDevices?.filter(d =>
            new Date(d.created_at) >= oneWeekAgo
        );
        console.log(`Dispositivos registrados esta semana: ${recentPush?.length || 0}`);
    }

    // Verificar si hay alguna tabla de usuarios o profiles
    const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('id, created_at');

    if (!profilesError && profiles) {
        console.log(`\nTotal usuarios registrados: ${profiles.length}`);
        const recentProfiles = profiles.filter(p => new Date(p.created_at) >= oneWeekAgo);
        console.log(`Usuarios registrados esta semana: ${recentProfiles.length}`);
    }

    // =====================================================================
    // 2. ACTIVIDAD EN COA.EXTRACTOSEUM.COM (Scans de COA)
    // =====================================================================
    console.log('\n' + '─'.repeat(70));
    console.log('🔍 ACTIVIDAD EN COA.EXTRACTOSEUM.COM (COA Scans)');
    console.log('─'.repeat(70));

    // Total de scans
    const { count: totalScans } = await supabase
        .from('coa_scans')
        .select('*', { count: 'exact', head: true });

    console.log(`Total scans históricos: ${totalScans || 0}`);

    // Scans esta semana
    const { data: weekScans, count: weekScansCount } = await supabase
        .from('coa_scans')
        .select('*', { count: 'exact' })
        .gte('created_at', oneWeekAgo.toISOString());

    console.log(`Scans esta semana: ${weekScansCount || 0}`);

    // Visitantes únicos esta semana
    const { data: uniqueVisitorsWeek } = await supabase
        .from('coa_scans')
        .select('ip_hash')
        .gte('created_at', oneWeekAgo.toISOString())
        .eq('is_unique_visit', true);

    const uniqueIPs = new Set(uniqueVisitorsWeek?.map(v => v.ip_hash) || []);
    console.log(`Visitantes únicos esta semana: ${uniqueIPs.size}`);

    // Desglose por tipo de acceso
    if (weekScans && weekScans.length > 0) {
        console.log('\n📈 Desglose por tipo de acceso (esta semana):');
        const accessTypes: Record<string, number> = {};
        weekScans.forEach(s => {
            accessTypes[s.access_type || 'unknown'] = (accessTypes[s.access_type || 'unknown'] || 0) + 1;
        });
        Object.entries(accessTypes).sort((a, b) => b[1] - a[1]).forEach(([type, count]) => {
            console.log(`   ${type}: ${count}`);
        });

        console.log('\n📱 Desglose por dispositivo (esta semana):');
        const deviceTypes: Record<string, number> = {};
        weekScans.forEach(s => {
            deviceTypes[s.device_type || 'unknown'] = (deviceTypes[s.device_type || 'unknown'] || 0) + 1;
        });
        Object.entries(deviceTypes).sort((a, b) => b[1] - a[1]).forEach(([type, count]) => {
            console.log(`   ${type}: ${count}`);
        });

        console.log('\n🌍 Top países (esta semana):');
        const countries: Record<string, number> = {};
        weekScans.forEach(s => {
            countries[s.country || 'Desconocido'] = (countries[s.country || 'Desconocido'] || 0) + 1;
        });
        Object.entries(countries).sort((a, b) => b[1] - a[1]).slice(0, 5).forEach(([country, count]) => {
            console.log(`   ${country}: ${count}`);
        });
    }

    // =====================================================================
    // 3. SYSTEM LOGS (Telemetría del frontend)
    // =====================================================================
    console.log('\n' + '─'.repeat(70));
    console.log('📝 LOGS DEL SISTEMA (Telemetría)');
    console.log('─'.repeat(70));

    const { data: systemLogs, count: logsCount } = await supabase
        .from('system_logs')
        .select('*', { count: 'exact' })
        .gte('created_at', oneWeekAgo.toISOString());

    console.log(`Total logs esta semana: ${logsCount || 0}`);

    if (systemLogs && systemLogs.length > 0) {
        console.log('\n📊 Desglose por categoría:');
        const categories: Record<string, number> = {};
        systemLogs.forEach(l => {
            categories[l.category || 'unknown'] = (categories[l.category || 'unknown'] || 0) + 1;
        });
        Object.entries(categories).sort((a, b) => b[1] - a[1]).forEach(([cat, count]) => {
            console.log(`   ${cat}: ${count}`);
        });
    }

    // =====================================================================
    // 4. BROWSING BEHAVIOR (Si existe)
    // =====================================================================
    console.log('\n' + '─'.repeat(70));
    console.log('👁️ COMPORTAMIENTO DE NAVEGACIÓN');
    console.log('─'.repeat(70));

    const { data: browsingData, error: browsingError } = await supabase
        .from('browsing_behavior')
        .select('*')
        .gte('created_at', oneWeekAgo.toISOString());

    if (browsingError) {
        console.log('⚠️  Tabla browsing_behavior no existe o error:', browsingError.message);
    } else {
        console.log(`Registros de navegación esta semana: ${browsingData?.length || 0}`);

        if (browsingData && browsingData.length > 0) {
            const avgTimeOnPage = browsingData.reduce((acc, b) => acc + (b.time_on_page || 0), 0) / browsingData.length;
            console.log(`Tiempo promedio en página: ${avgTimeOnPage.toFixed(1)} segundos`);
        }
    }

    // =====================================================================
    // 5. PDF DOWNLOADS
    // =====================================================================
    console.log('\n' + '─'.repeat(70));
    console.log('📄 DESCARGAS DE PDF');
    console.log('─'.repeat(70));

    const { count: pdfDownloads } = await supabase
        .from('pdf_downloads')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', oneWeekAgo.toISOString());

    console.log(`Descargas de PDF esta semana: ${pdfDownloads || 0}`);

    // =====================================================================
    // 6. LINK CLICKS
    // =====================================================================
    console.log('\n' + '─'.repeat(70));
    console.log('🔗 CLICS EN ENLACES');
    console.log('─'.repeat(70));

    const { data: linkClicks, count: clicksCount } = await supabase
        .from('link_clicks')
        .select('*', { count: 'exact' })
        .gte('created_at', oneWeekAgo.toISOString());

    console.log(`Clics en enlaces esta semana: ${clicksCount || 0}`);

    if (linkClicks && linkClicks.length > 0) {
        console.log('\n📊 Desglose por tipo de link:');
        const linkTypes: Record<string, number> = {};
        linkClicks.forEach(l => {
            linkTypes[l.link_type || 'unknown'] = (linkTypes[l.link_type || 'unknown'] || 0) + 1;
        });
        Object.entries(linkTypes).sort((a, b) => b[1] - a[1]).forEach(([type, count]) => {
            console.log(`   ${type}: ${count}`);
        });
    }

    // =====================================================================
    // 7. CRM CONTACTS (Usuarios del CRM/WhatsApp)
    // =====================================================================
    console.log('\n' + '─'.repeat(70));
    console.log('👥 CONTACTOS CRM (WhatsApp)');
    console.log('─'.repeat(70));

    const { count: totalContacts } = await supabase
        .from('crm_contact_snapshots')
        .select('*', { count: 'exact', head: true });

    console.log(`Total contactos en CRM: ${totalContacts || 0}`);

    const { count: recentContacts } = await supabase
        .from('crm_contact_snapshots')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', oneWeekAgo.toISOString());

    console.log(`Contactos nuevos esta semana: ${recentContacts || 0}`);

    // =====================================================================
    // 8. MENSAJES WHATSAPP
    // =====================================================================
    console.log('\n' + '─'.repeat(70));
    console.log('💬 MENSAJES WHATSAPP');
    console.log('─'.repeat(70));

    const { count: totalMessages } = await supabase
        .from('whatsapp_messages')
        .select('*', { count: 'exact', head: true });

    console.log(`Total mensajes históricos: ${totalMessages || 0}`);

    const { data: weekMessages, count: weekMessagesCount } = await supabase
        .from('whatsapp_messages')
        .select('direction, role', { count: 'exact' })
        .gte('created_at', oneWeekAgo.toISOString());

    console.log(`Mensajes esta semana: ${weekMessagesCount || 0}`);

    if (weekMessages && weekMessages.length > 0) {
        const inbound = weekMessages.filter(m => m.direction === 'inbound').length;
        const outbound = weekMessages.filter(m => m.direction === 'outbound').length;
        console.log(`   Entrantes: ${inbound}`);
        console.log(`   Salientes: ${outbound}`);
    }

    // =====================================================================
    // 9. ACTIVIDAD DIARIA (últimos 7 días)
    // =====================================================================
    console.log('\n' + '─'.repeat(70));
    console.log('📅 ACTIVIDAD DIARIA (últimos 7 días)');
    console.log('─'.repeat(70));

    const { data: dailyScans } = await supabase
        .from('coa_scans')
        .select('created_at')
        .gte('created_at', oneWeekAgo.toISOString());

    if (dailyScans && dailyScans.length > 0) {
        const byDay: Record<string, number> = {};
        dailyScans.forEach(s => {
            const day = new Date(s.created_at).toLocaleDateString('es-MX', { weekday: 'short', month: 'short', day: 'numeric' });
            byDay[day] = (byDay[day] || 0) + 1;
        });

        Object.entries(byDay).forEach(([day, count]) => {
            const bar = '█'.repeat(Math.min(Math.ceil(count / 5), 20));
            console.log(`   ${day.padEnd(15)} ${bar} ${count}`);
        });
    }

    // =====================================================================
    // 10. RESUMEN EJECUTIVO
    // =====================================================================
    console.log('\n' + '='.repeat(70));
    console.log('📋 RESUMEN EJECUTIVO');
    console.log('='.repeat(70));
    console.log(`
┌─────────────────────────────────────┬──────────────┐
│ Métrica                             │ Esta Semana  │
├─────────────────────────────────────┼──────────────┤
│ Scans de COA                        │ ${String(weekScansCount || 0).padStart(12)} │
│ Visitantes únicos                   │ ${String(uniqueIPs.size).padStart(12)} │
│ Descargas de PDF                    │ ${String(pdfDownloads || 0).padStart(12)} │
│ Clics en enlaces                    │ ${String(clicksCount || 0).padStart(12)} │
│ Contactos nuevos CRM                │ ${String(recentContacts || 0).padStart(12)} │
│ Mensajes WhatsApp                   │ ${String(weekMessagesCount || 0).padStart(12)} │
│ Dispositivos push registrados       │ ${String(pushDevices?.filter(d => new Date(d.created_at) >= oneWeekAgo).length || 0).padStart(12)} │
└─────────────────────────────────────┴──────────────┘
`);

    // =====================================================================
    // 11. VERIFICACIÓN DE EXTRACTOSEUM.COM (Landing)
    // =====================================================================
    console.log('\n' + '─'.repeat(70));
    console.log('🌐 NOTA SOBRE EXTRACTOSEUM.COM');
    console.log('─'.repeat(70));
    console.log(`
⚠️  El dominio extractoseum.com (landing page) NO tiene tracking
    configurado en este repositorio.

    Para obtener métricas de la landing page necesitarías:
    1. Configurar Google Analytics en la landing
    2. O implementar tracking similar al de coa.extractoseum.com

    Actualmente solo tenemos métricas de: coa.extractoseum.com
`);

    console.log('\n' + '='.repeat(70));
    console.log('Reporte generado exitosamente.');
    console.log('='.repeat(70));
}

generateReport().catch(console.error);
