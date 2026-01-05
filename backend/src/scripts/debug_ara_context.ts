import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../../.env') });

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

// Helper function to clean phone numbers
function cleanupPhone(phone: string): string {
    return phone.replace(/\D/g, '').replace(/^52/, '');
}

async function debugAraContext() {
    const phoneNumber = '3327177432';
    const cleanPhone = cleanupPhone(phoneNumber);

    console.log('='.repeat(60));
    console.log(`DEBUG: Ara Context for phone ${phoneNumber}`);
    console.log(`Clean phone: ${cleanPhone}`);
    console.log('='.repeat(60));

    // 1. Check if client exists
    console.log('\n--- 1. CHECKING CLIENTS TABLE ---');
    const { data: clients, error: clientError } = await supabase
        .from('clients')
        .select('id, name, email, phone, tags, total_spent')
        .or(`phone.ilike.%${cleanPhone}%,phone.ilike.%${cleanPhone.slice(-10)}%`);

    if (clientError) {
        console.error('Client query error:', clientError.message);
    } else if (!clients || clients.length === 0) {
        console.log('NO CLIENT FOUND with this phone number!');
    } else {
        console.log(`Found ${clients.length} client(s):`);
        clients.forEach(c => {
            console.log(`  - ID: ${c.id}, Name: ${c.name}, Phone: ${c.phone}, Email: ${c.email}`);
        });
    }

    // 2. Check orders with client_id
    if (clients && clients.length > 0) {
        console.log('\n--- 2. CHECKING ORDERS BY CLIENT_ID ---');
        for (const client of clients) {
            const { data: orders, error: ordersError } = await supabase
                .from('orders')
                .select('id, order_number, total_amount, financial_status, fulfillment_status, status, shopify_created_at')
                .eq('client_id', client.id)
                .order('shopify_created_at', { ascending: false })
                .limit(10);

            if (ordersError) {
                console.error(`Orders query error for client ${client.id}:`, ordersError.message);
            } else if (!orders || orders.length === 0) {
                console.log(`NO ORDERS found for client_id ${client.id}`);
            } else {
                console.log(`Found ${orders.length} order(s) for client_id ${client.id}:`);
                orders.forEach(o => {
                    console.log(`  - ${o.order_number}: $${o.total_amount} | status: ${o.financial_status} | fulfillment: ${o.fulfillment_status}`);
                });
            }
        }
    }

    // 3. Check orders by customer_phone directly
    console.log('\n--- 3. CHECKING ORDERS BY CUSTOMER_PHONE ---');
    const { data: ordersByPhone, error: ordersByPhoneError } = await supabase
        .from('orders')
        .select('id, order_number, total_amount, financial_status, fulfillment_status, status, shopify_created_at, customer_phone, client_id')
        .or(`customer_phone.ilike.%${cleanPhone}%,customer_phone.ilike.%${cleanPhone.slice(-10)}%`)
        .order('shopify_created_at', { ascending: false })
        .limit(10);

    if (ordersByPhoneError) {
        console.error('Orders by phone query error:', ordersByPhoneError.message);
    } else if (!ordersByPhone || ordersByPhone.length === 0) {
        console.log('NO ORDERS found with this customer_phone!');
    } else {
        console.log(`Found ${ordersByPhone.length} order(s) by customer_phone:`);
        ordersByPhone.forEach(o => {
            console.log(`  - ${o.order_number}: $${o.total_amount} | phone: ${o.customer_phone} | client_id: ${o.client_id}`);
        });
    }

    // 4. Search for order #1441 specifically
    console.log('\n--- 4. SEARCHING FOR ORDER #1441 ---');
    const { data: order1441, error: order1441Error } = await supabase
        .from('orders')
        .select('*')
        .or(`order_number.ilike.%1441%,order_number.ilike.%EUM_1441%`)
        .limit(5);

    if (order1441Error) {
        console.error('Order 1441 query error:', order1441Error.message);
    } else if (!order1441 || order1441.length === 0) {
        console.log('ORDER #1441 NOT FOUND!');
    } else {
        console.log(`Found ${order1441.length} order(s) matching #1441:`);
        order1441.forEach(o => {
            console.log(`  Order: ${o.order_number}`);
            console.log(`    - ID: ${o.id}`);
            console.log(`    - client_id: ${o.client_id}`);
            console.log(`    - customer_phone: ${o.customer_phone}`);
            console.log(`    - customer_email: ${o.customer_email}`);
            console.log(`    - total_amount: ${o.total_amount}`);
            console.log(`    - financial_status: ${o.financial_status}`);
            console.log(`    - fulfillment_status: ${o.fulfillment_status}`);
        });
    }

    // 5. Check table columns
    console.log('\n--- 5. ORDERS TABLE COLUMNS ---');
    const { data: sampleOrder } = await supabase
        .from('orders')
        .select('*')
        .limit(1)
        .single();

    if (sampleOrder) {
        console.log('Available columns in orders table:');
        Object.keys(sampleOrder).forEach(key => {
            console.log(`  - ${key}: ${typeof sampleOrder[key]}`);
        });
    }

    console.log('\n' + '='.repeat(60));
    console.log('DEBUG COMPLETE');
    console.log('='.repeat(60));
}

debugAraContext().catch(console.error);
