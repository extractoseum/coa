/**
 * Debug Oracle - Full diagnostic to identify why predictions aren't being generated
 * Run with: npx ts-node src/scripts/debug_oracle_full.ts
 */

import { supabase } from '../config/supabase';

async function debugOracle() {
    console.log('═══════════════════════════════════════════════════════════');
    console.log('             ORACLE DIAGNOSTIC - FULL DEBUG');
    console.log('═══════════════════════════════════════════════════════════\n');

    // 1. Check orders table
    console.log('📦 CHECKING ORDERS TABLE...');
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - 180);

    const { data: orders, error: ordersError, count: ordersCount } = await supabase
        .from('orders')
        .select('*', { count: 'exact', head: false })
        .gte('shopify_created_at', cutoffDate.toISOString())
        .not('customer_email', 'is', null)
        .limit(5);

    if (ordersError) {
        console.log('❌ Error fetching orders:', ordersError.message);
    } else {
        console.log(`✅ Orders in last 180 days: ${ordersCount}`);
        if (orders && orders.length > 0) {
            console.log('   Sample order structure:');
            const sample = orders[0];
            console.log(`   - id: ${sample.id}`);
            console.log(`   - customer_email: ${sample.customer_email}`);
            console.log(`   - shopify_created_at: ${sample.shopify_created_at}`);
            console.log(`   - line_items type: ${typeof sample.line_items}`);
            console.log(`   - line_items: ${JSON.stringify(sample.line_items)?.substring(0, 200)}...`);
        }
    }

    // 2. Check line_items structure
    console.log('\n📋 CHECKING LINE_ITEMS STRUCTURE...');
    if (orders && orders.length > 0) {
        let ordersWithLineItems = 0;
        let ordersWithProductId = 0;

        for (const order of orders) {
            if (order.line_items && Array.isArray(order.line_items) && order.line_items.length > 0) {
                ordersWithLineItems++;
                const firstItem = order.line_items[0] as any;
                if (firstItem.product_id || firstItem.shopify_product_id) {
                    ordersWithProductId++;
                }
            }
        }

        console.log(`   - Orders with line_items array: ${ordersWithLineItems}/${orders.length}`);
        console.log(`   - Orders with product_id in line_items: ${ordersWithProductId}/${orders.length}`);

        // Show actual line_item keys
        const sampleLineItem = orders.find(o => o.line_items?.length > 0)?.line_items?.[0];
        if (sampleLineItem) {
            console.log(`   - Sample line_item keys: ${Object.keys(sampleLineItem).join(', ')}`);
        }
    }

    // 3. Check products table
    console.log('\n📦 CHECKING PRODUCTS TABLE...');
    const { data: products, error: productsError, count: productsCount } = await supabase
        .from('products')
        .select('id, title', { count: 'exact', head: false })
        .limit(5);

    if (productsError) {
        console.log('❌ Error fetching products:', productsError.message);
    } else {
        console.log(`✅ Products count: ${productsCount}`);
        if (products && products.length > 0) {
            console.log('   Sample products:');
            products.forEach(p => console.log(`   - [${p.id}] ${p.title}`));
        }
    }

    // 4. Check consumption profiles
    console.log('\n⚙️ CHECKING CONSUMPTION PROFILES...');
    const { data: profiles, error: profilesError, count: profilesCount } = await supabase
        .from('product_consumption_profiles')
        .select('*', { count: 'exact', head: false })
        .limit(5);

    if (profilesError) {
        console.log('❌ Error fetching profiles:', profilesError.message);
    } else {
        console.log(`✅ Profiles count: ${profilesCount}`);
        if (profiles && profiles.length > 0) {
            console.log('   Sample profiles:');
            profiles.forEach(p => {
                console.log(`   - [${p.shopify_product_id}] ${p.product_title}`);
                console.log(`     Days supply: ${p.estimated_days_supply}, Avg reorder: ${p.avg_reorder_days}`);
            });
        }
    }

    // 5. Check existing predictions
    console.log('\n🔮 CHECKING EXISTING PREDICTIONS...');
    const { data: predictions, error: predictionsError, count: predictionsCount } = await supabase
        .from('restock_predictions')
        .select('*', { count: 'exact', head: false })
        .limit(5);

    if (predictionsError) {
        console.log('❌ Error fetching predictions:', predictionsError.message);
    } else {
        console.log(`✅ Predictions count: ${predictionsCount}`);
        if (predictions && predictions.length > 0) {
            console.log('   Sample predictions:');
            predictions.forEach(p => {
                console.log(`   - ${p.customer_email} -> ${p.product_title}`);
                console.log(`     Predicted: ${p.predicted_restock_date}, Status: ${p.notification_status}`);
            });
        }
    }

    // 6. Product ID matching check
    console.log('\n🔗 CHECKING PRODUCT ID MATCHING...');

    // Get unique product IDs from orders
    const { data: ordersForIds } = await supabase
        .from('orders')
        .select('line_items')
        .not('line_items', 'is', null)
        .limit(100);

    const productIdsFromOrders = new Set<string>();
    if (ordersForIds) {
        for (const order of ordersForIds) {
            if (Array.isArray(order.line_items)) {
                for (const item of order.line_items as any[]) {
                    const pid = item.product_id || item.shopify_product_id;
                    if (pid) productIdsFromOrders.add(String(pid));
                }
            }
        }
    }

    console.log(`   - Unique product IDs found in orders: ${productIdsFromOrders.size}`);

    // Check if these exist in products table
    if (productIdsFromOrders.size > 0) {
        const sampleIds = Array.from(productIdsFromOrders).slice(0, 5);
        console.log(`   - Sample IDs from orders: ${sampleIds.join(', ')}`);

        const { data: matchingProducts } = await supabase
            .from('products')
            .select('id')
            .in('id', Array.from(productIdsFromOrders).slice(0, 100));

        console.log(`   - Matching products in DB: ${matchingProducts?.length || 0}`);

        // Check profiles too
        const { data: matchingProfiles } = await supabase
            .from('product_consumption_profiles')
            .select('shopify_product_id')
            .in('shopify_product_id', Array.from(productIdsFromOrders).slice(0, 100));

        console.log(`   - Matching profiles: ${matchingProfiles?.length || 0}`);
    }

    // 7. Customer analysis
    console.log('\n👥 CUSTOMER ANALYSIS...');
    const { data: customerData } = await supabase
        .from('orders')
        .select('customer_email')
        .not('customer_email', 'is', null)
        .gte('shopify_created_at', cutoffDate.toISOString());

    if (customerData) {
        const uniqueCustomers = new Set(customerData.map(o => o.customer_email?.toLowerCase()));
        console.log(`   - Unique customers with orders (180 days): ${uniqueCustomers.size}`);
    }

    // 8. Summary and recommendations
    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('                    DIAGNOSIS SUMMARY');
    console.log('═══════════════════════════════════════════════════════════\n');

    const issues: string[] = [];
    const recommendations: string[] = [];

    if (!ordersCount || ordersCount === 0) {
        issues.push('No orders found in database');
        recommendations.push('Ensure Shopify orders are syncing to the "orders" table');
    }

    if (productIdsFromOrders.size === 0) {
        issues.push('No product_id found in order line_items');
        recommendations.push('Check that line_items contain product_id or shopify_product_id field');
    }

    if (!productsCount || productsCount === 0) {
        issues.push('No products in products table');
        recommendations.push('Run Shopify product sync to populate products table');
    }

    if (!predictionsCount || predictionsCount === 0) {
        issues.push('No predictions generated');
        recommendations.push('Click "Generar Predicciones" button to trigger prediction generation');
    }

    if (issues.length === 0) {
        console.log('✅ No critical issues found. System appears configured correctly.');
        console.log('   Try clicking "Generar Predicciones" to generate new predictions.');
    } else {
        console.log('❌ Issues found:');
        issues.forEach((issue, i) => console.log(`   ${i + 1}. ${issue}`));
        console.log('\n📋 Recommendations:');
        recommendations.forEach((rec, i) => console.log(`   ${i + 1}. ${rec}`));
    }

    console.log('\n═══════════════════════════════════════════════════════════\n');
}

debugOracle().catch(console.error);
