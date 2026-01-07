/**
 * Script para verificar si los clientes recibieron notificación de tracking
 * para pedidos específicos
 */

import { supabase } from '../config/supabase';

// Lista de pedidos a verificar (de la captura)
const ORDER_NUMBERS = [
    'EUM_1611',
    'EUM_1610',
    'EUM_1607',
    'EUM_1606',
    'EUM_1605',
    'EUM_1604',
    'EUM_1603',
    'EUM_1602',
    'EUM_1601',
    'EUM_1599',
    'EUM_1598',
    'EUM_1302',
    'EUM_1291',
    'EUM_1127'
];

async function verifyTrackingNotifications() {
    console.log('='.repeat(80));
    console.log('VERIFICACIÓN DE NOTIFICACIONES DE TRACKING');
    console.log('='.repeat(80));
    console.log(`Fecha: ${new Date().toLocaleString('es-MX')}`);
    console.log(`Pedidos a verificar: ${ORDER_NUMBERS.length}`);
    console.log('');

    const results: any[] = [];

    for (const orderNum of ORDER_NUMBERS) {
        console.log(`\n📦 ${orderNum}`);
        console.log('-'.repeat(40));

        // 1. Buscar el pedido en orders
        const { data: order } = await supabase
            .from('orders')
            .select('id, order_number, fulfillment_status, tracking_number, tracking_url, shipping_carrier, client_id, updated_at')
            .or(`order_number.eq.${orderNum},order_number.eq.${orderNum}_SHOP`)
            .single();

        if (!order) {
            console.log(`  ❌ Pedido no encontrado en DB`);
            results.push({ order: orderNum, status: 'NOT_FOUND', notified: false });
            continue;
        }

        console.log(`  Estado: ${order.fulfillment_status || 'N/A'}`);
        console.log(`  Tracking: ${order.tracking_number || 'Sin guía'}`);
        console.log(`  Carrier: ${order.shipping_carrier || 'N/A'}`);

        // 2. Buscar si hay cliente asociado
        let clientPhone = null;
        let clientEmail = null;
        let clientName = null;

        if (order.client_id) {
            const { data: client } = await supabase
                .from('clients')
                .select('phone, email, name')
                .eq('id', order.client_id)
                .single();

            if (client) {
                clientPhone = client.phone;
                clientEmail = client.email;
                clientName = client.name;
                console.log(`  Cliente: ${clientName || 'N/A'}`);
                console.log(`  Teléfono: ${clientPhone || 'N/A'}`);
            }
        }

        // 3. Buscar logs de notificaciones de tracking para este pedido
        const { data: trackingLogs } = await supabase
            .from('system_logs')
            .select('*')
            .or(`metadata->order_number.eq.${orderNum},metadata->order_number.eq.${orderNum}_SHOP,metadata->>order_number.eq.${orderNum}`)
            .in('event_type', ['tracking_notification_sent', 'whatsapp_tracking_sent', 'fulfillment_notification'])
            .order('created_at', { ascending: false })
            .limit(5);

        // 4. Buscar mensajes enviados con tracking
        const { data: messages } = await supabase
            .from('messages')
            .select('content, created_at, sender')
            .or(`content.ilike.%${orderNum}%,content.ilike.%tracking%,content.ilike.%guía%,content.ilike.%envío%`)
            .eq('sender', 'ara')
            .order('created_at', { ascending: false })
            .limit(5);

        // 5. Buscar en whatsapp_outbox
        const { data: waOutbox } = await supabase
            .from('whatsapp_outbox')
            .select('*')
            .or(`metadata->order_number.eq.${orderNum},body.ilike.%${orderNum}%`)
            .order('created_at', { ascending: false })
            .limit(3);

        const hasTrackingLog = trackingLogs && trackingLogs.length > 0;
        const hasTrackingMessage = messages && messages.some(m =>
            m.content?.toLowerCase().includes('tracking') ||
            m.content?.toLowerCase().includes('guía') ||
            m.content?.toLowerCase().includes('rastrear')
        );
        const hasWaOutbox = waOutbox && waOutbox.length > 0;

        const notified = hasTrackingLog || hasTrackingMessage || hasWaOutbox;

        if (notified) {
            console.log(`  ✅ NOTIFICACIÓN ENCONTRADA`);
            if (hasTrackingLog) {
                console.log(`     - Log: ${trackingLogs![0].event_type} @ ${new Date(trackingLogs![0].created_at).toLocaleString('es-MX')}`);
            }
            if (hasTrackingMessage) {
                console.log(`     - Mensaje enviado a conversación`);
            }
            if (hasWaOutbox) {
                console.log(`     - WhatsApp outbox: ${waOutbox![0].status}`);
            }
        } else {
            if (order.tracking_number) {
                console.log(`  ⚠️  TIENE TRACKING PERO NO HAY REGISTRO DE NOTIFICACIÓN`);
            } else {
                console.log(`  ℹ️  Sin tracking asignado aún`);
            }
        }

        results.push({
            order: orderNum,
            fulfillment_status: order.fulfillment_status,
            tracking_number: order.tracking_number,
            carrier: order.shipping_carrier,
            client_name: clientName,
            client_phone: clientPhone,
            notified,
            notification_source: hasTrackingLog ? 'log' : hasTrackingMessage ? 'message' : hasWaOutbox ? 'wa_outbox' : null
        });
    }

    // Resumen
    console.log('\n');
    console.log('='.repeat(80));
    console.log('RESUMEN');
    console.log('='.repeat(80));

    const withTracking = results.filter(r => r.tracking_number);
    const notified = results.filter(r => r.notified);
    const pendingNotification = results.filter(r => r.tracking_number && !r.notified);
    const noTracking = results.filter(r => !r.tracking_number);

    console.log(`\nTotal pedidos revisados: ${results.length}`);
    console.log(`Con tracking asignado: ${withTracking.length}`);
    console.log(`Notificados: ${notified.length}`);
    console.log(`⚠️  Pendientes de notificar (tienen tracking pero no notificación): ${pendingNotification.length}`);
    console.log(`Sin tracking aún: ${noTracking.length}`);

    if (pendingNotification.length > 0) {
        console.log('\n📋 PEDIDOS PENDIENTES DE NOTIFICAR:');
        pendingNotification.forEach(p => {
            console.log(`   - ${p.order}: ${p.tracking_number} (${p.carrier || 'carrier?'}) - Cliente: ${p.client_name || 'N/A'}`);
        });
    }

    if (noTracking.length > 0) {
        console.log('\n📋 PEDIDOS SIN TRACKING (esperando guía):');
        noTracking.forEach(p => {
            console.log(`   - ${p.order} - ${p.fulfillment_status || 'sin estado'}`);
        });
    }

    return results;
}

verifyTrackingNotifications()
    .then(() => process.exit(0))
    .catch(err => {
        console.error('Error:', err);
        process.exit(1);
    });
