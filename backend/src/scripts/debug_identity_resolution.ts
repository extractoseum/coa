
import { CRMService } from '../services/CRMService';
import { supabase } from '../config/supabase';
import { getShopifyCustomerByEmail, searchShopifyCustomers } from '../services/shopifyService';
import * as dotenv from 'dotenv';
import path from 'path';

// Load env
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const TEST_HANDLE = '3327177432';
const TEST_EMAIL = 'bdelatorre8@gmail.com';

async function run() {
    console.log('--- DEBUG IDENTITY RESOLUTION ---');

    // 1. Check Local DB for Orders with this phone
    console.log(`\n1. Checking Local DB (orders) for phone LIKE '%${TEST_HANDLE}':`);
    const { data: orders, error } = await supabase
        .from('orders')
        .select('id, order_number, customer_email, customer_phone')
        .ilike('customer_phone', `%${TEST_HANDLE}`) // Try suffix match
        .limit(5);

    if (error) console.error('DB Error:', error.message);
    else console.log('Local Orders Found:', orders?.length, orders);

    // 2. Check Shopify API directly
    console.log(`\n2. Checking Shopify API for phone '${TEST_HANDLE}':`);
    try {
        const customers = await searchShopifyCustomers(`phone:${TEST_HANDLE}`);
        console.log('Shopify Customers Found (Phone):', customers.length);
        if (customers.length > 0) {
            console.log('Sample Customer:', {
                id: customers[0].id,
                email: customers[0].email,
                phone: customers[0].phone
            });
        }
    } catch (e: any) {
        console.error('Shopify API Error:', e.message);
    }

    // 3. Check Shopify API by Email
    console.log(`\n3. Checking Shopify API for email '${TEST_EMAIL}':`);
    try {
        const customer = await getShopifyCustomerByEmail(TEST_EMAIL);
        console.log('Shopify Customer Found (Email):', customer ? 'YES' : 'NO');
        if (customer) {
            console.log('Customer Details:', {
                id: customer.id,
                phone: customer.phone,
                orders_count: customer.orders_count
            });
        }
    } catch (e: any) {
        console.error('Shopify API Error:', e.message);
    }
}

run();
