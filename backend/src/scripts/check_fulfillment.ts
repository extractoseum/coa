import { supabase } from "../config/supabase";

const orderNumbers = [
    "EUM_1611_SHOP", "EUM_1610_SHOP", "EUM_1607_SHOP", "EUM_1606_SHOP",
    "EUM_1605_SHOP", "EUM_1604_SHOP", "EUM_1603_SHOP", "EUM_1602_SHOP",
    "EUM_1601_SHOP", "EUM_1599_SHOP", "EUM_1598_SHOP", "EUM_1302_SHOP",
    "EUM_1291_SHOP", "EUM_1127_SHOP"
];

async function check() {
    const { data: orders } = await supabase
        .from("orders")
        .select("order_number, status, fulfillment_status, fulfilled_notified, client_id")
        .in("order_number", orderNumbers);

    console.log("Pedidos encontrados:", orders?.length);
    console.log("");
    console.log("ORDER_NUMBER        | STATUS     | FULFILLMENT | NOTIFIED | CLIENT");
    console.log("-".repeat(80));

    for (const o of orders || []) {
        const notified = o.fulfilled_notified ? "YES" : "NO";
        console.log(
            o.order_number.padEnd(20) + "| " +
            (o.status || "N/A").padEnd(11) + "| " +
            (o.fulfillment_status || "null").padEnd(12) + "| " +
            notified.padEnd(9) + "| " +
            (o.client_id ? o.client_id.substring(0, 8) : "N/A")
        );
    }

    const found = orders?.map(o => o.order_number) || [];
    const notFoundOrders = orderNumbers.filter(num => !found.includes(num));
    if (notFoundOrders.length > 0) {
        console.log("\nNO encontrados:", notFoundOrders.join(", "));
    }

    // Check system_logs for tracking notifications
    console.log("\n\n=== LOGS DE NOTIFICACIONES DE TRACKING ===\n");

    const { data: logs } = await supabase
        .from("system_logs")
        .select("event_type, metadata, created_at")
        .in("event_type", ["fulfillment_notification", "tracking_notification_sent", "whatsapp_tracking_sent"])
        .order("created_at", { ascending: false })
        .limit(20);

    if (logs && logs.length > 0) {
        for (const log of logs) {
            const meta = log.metadata as any;
            console.log(`${log.event_type} @ ${log.created_at}`);
            console.log(`  Order: ${meta?.order_number || "N/A"}, Phone: ${meta?.phone || "N/A"}`);
        }
    } else {
        console.log("No se encontraron logs de notificaciones de tracking");
    }
}

check().then(() => process.exit(0));
