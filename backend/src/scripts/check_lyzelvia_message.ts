import { supabase } from '../config/supabase';

async function main() {
    console.log('Buscando mensajes enviados recientemente...\n');

    // First, find Lyzelvia specifically
    const { data: lyzelvia } = await supabase
        .from('clients')
        .select('id, name')
        .ilike('name', '%Lyzelvia%')
        .single();

    if (lyzelvia) {
        console.log(`Encontrada cliente: ${lyzelvia.name} (ID: ${lyzelvia.id})\n`);

        const { data: lyAlert } = await supabase
            .from('ghost_alerts')
            .select('*')
            .eq('client_id', lyzelvia.id)
            .single();

        if (lyAlert) {
            console.log('Estado de su alerta:');
            console.log(JSON.stringify(lyAlert, null, 2));
        }
    }

    // Find recently contacted alerts
    const { data: alerts, error } = await supabase
        .from('ghost_alerts')
        .select(`
            id,
            ghost_level,
            days_inactive,
            reactivation_status,
            reactivation_channel,
            reactivation_message,
            reactivation_sent_at,
            client_id
        `)
        .not('reactivation_message', 'is', null)
        .order('reactivation_sent_at', { ascending: false, nullsFirst: false })
        .limit(5);

    if (error) {
        console.error('Error:', error);
        return;
    }

    if (!alerts || alerts.length === 0) {
        console.log('No se encontraron alertas contactadas recientemente.');
        return;
    }

    console.log(`Encontradas ${alerts.length} alertas contactadas:\n`);

    for (const alert of alerts) {
        // Get client info
        const { data: client } = await supabase
            .from('clients')
            .select('name, phone, email, shopify_orders_count, shopify_total_spent, shopify_tags, customer_segment')
            .eq('id', alert.client_id)
            .single();

        console.log('═══════════════════════════════════════════════════════════');
        console.log(`👤 Cliente: ${client?.name}`);
        console.log(`📱 Teléfono: ${client?.phone || 'N/A'}`);
        console.log(`📧 Email: ${client?.email || 'N/A'}`);
        console.log(`🏷️  Ghost Level: ${alert.ghost_level}`);
        console.log(`📅 Días inactivo: ${alert.days_inactive}`);
        console.log(`💰 Órdenes: ${client?.shopify_orders_count || 0} | Total: $${client?.shopify_total_spent || 0}`);
        console.log(`🏷️  Tags Shopify: ${client?.shopify_tags || 'Sin tags'}`);
        console.log(`📊 Segmento: ${client?.customer_segment || 'unknown'}`);
        console.log(`📨 Canal: ${alert.reactivation_channel}`);
        console.log(`🕐 Enviado: ${alert.reactivation_sent_at}`);
        console.log('\n📝 MENSAJE ENVIADO:');
        console.log('───────────────────────────────────────────────────────────');
        console.log(alert.reactivation_message);
        console.log('═══════════════════════════════════════════════════════════\n');
    }
}

main().catch(console.error);
