
import dotenv from 'dotenv';
dotenv.config();
import { supabase } from '../src/config/supabase';

async function investigateBroadly() {
    console.log("--- BROAD PRODUCT CHECK ---");
    // Just get ANY products to see naming convention
    const { data: products } = await supabase
        .from("products")
        .select("id, title, handle, product_type, variants")
        .limit(5);

    console.log("Sample Products:", JSON.stringify(products, null, 2));

    console.log("--- SEARCHING FOR GUMMIES ---");
    const { data: gummies } = await supabase
        .from("products")
        .select("id, title, handle, product_type")
        .ilike("title", "%gummies%")
        .limit(5);
    console.log("Gummies found:", JSON.stringify(gummies, null, 2));

    console.log("--- SEARCHING FOR 'Bites' ---");
    const { data: bites } = await supabase
        .from("products")
        .select("id, title, handle, product_type")
        .ilike("title", "%bites%")
        .limit(5);
    console.log("Bites found:", JSON.stringify(bites, null, 2));
}

investigateBroadly();
