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
        .select("order_number, fulfillment_status, tracking_number, shipping_carrier, updated_at")
        .in("order_number", orderNumbers);

    console.log("Pedidos encontrados:", orders?.length || 0);

    if (orders) {
        for (const o of orders) {
            console.log("");
            console.log("📦 " + o.order_number);
            console.log("   Fulfillment: " + (o.fulfillment_status || "N/A"));
            console.log("   Tracking: " + (o.tracking_number || "SIN GUÍA"));
            console.log("   Carrier: " + (o.shipping_carrier || "N/A"));
        }

        const found = orders.map(o => o.order_number);
        const notFound = orderNumbers.filter(num => !found.includes(num));
        if (notFound.length > 0) {
            console.log("");
            console.log("NO encontrados:", notFound.join(", "));
        }
    }
}

check().then(() => process.exit(0));
