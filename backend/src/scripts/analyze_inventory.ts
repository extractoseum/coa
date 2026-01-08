/**
 * Analyze Inventory Intelligence
 * Run with: npx ts-node src/scripts/analyze_inventory.ts
 */

import { supabase } from '../config/supabase';

async function analyzeInventory() {
    console.log('═══════════════════════════════════════════════════════════');
    console.log('       INVENTORY INTELLIGENCE ANALYSIS');
    console.log('═══════════════════════════════════════════════════════════\n');

    // 1. Check sales history
    const { data: sales } = await supabase
        .from('product_sales_history')
        .select('shopify_product_id, product_title, sale_date, units_sold')
        .order('sale_date', { ascending: false })
        .limit(10);

    console.log('📊 Recent sales history:');
    sales?.forEach(s => {
        console.log(`   ${s.sale_date}: ${s.product_title} - ${s.units_sold} units`);
    });

    // 2. Count days per product in last 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const { data: salesLast30 } = await supabase
        .from('product_sales_history')
        .select('shopify_product_id, product_title, units_sold')
        .gte('sale_date', thirtyDaysAgo.toISOString().split('T')[0]);

    const productStats: Record<string, { title: string; totalUnits: number; days: number }> = {};
    salesLast30?.forEach(s => {
        if (!productStats[s.shopify_product_id]) {
            productStats[s.shopify_product_id] = { title: s.product_title, totalUnits: 0, days: 0 };
        }
        productStats[s.shopify_product_id].totalUnits += s.units_sold;
        productStats[s.shopify_product_id].days += 1;
    });

    console.log('\n📈 Product stats (last 30 days):');
    console.log('   (Need 7+ days of data for forecast to work)\n');
    for (const [id, stats] of Object.entries(productStats)) {
        const needsMore = stats.days < 7 ? ' ⚠️ NOT ENOUGH DATA' : ' ✅';
        console.log(`   ${stats.title}:`);
        console.log(`      Days with sales: ${stats.days}, Total units: ${stats.totalUnits}${needsMore}`);
    }

    // 3. Products with inventory vs sales
    console.log('\n📦 INVENTORY vs DEMAND ANALYSIS:');
    const { data: products } = await supabase
        .from('products')
        .select('id, title, variants')
        .limit(15);

    const inventoryAnalysis: Array<{
        title: string;
        stock: number;
        avgDaily: number;
        daysOfStock: number | string;
        status: string;
    }> = [];

    products?.forEach(p => {
        const variants = p.variants as any[];
        let totalStock = 0;
        if (variants && Array.isArray(variants)) {
            totalStock = variants.reduce((sum: number, v: any) => sum + (v.inventory_quantity || 0), 0);
        }

        const pStats = productStats[String(p.id)];
        const avgDaily = pStats ? (pStats.totalUnits / pStats.days) : 0;
        let daysOfStock: number | string = 'N/A';
        let status = '⚪ No sales data';

        if (avgDaily > 0) {
            daysOfStock = Math.round(totalStock / avgDaily);
            if (daysOfStock <= 7) {
                status = '🔴 CRITICAL - Stockout risk!';
            } else if (daysOfStock <= 14) {
                status = '🟠 LOW STOCK - Reorder soon';
            } else if (daysOfStock <= 30) {
                status = '🟡 OK - Monitor';
            } else {
                status = '🟢 HEALTHY';
            }
        } else if (totalStock === 0) {
            status = '⚫ OUT OF STOCK';
        }

        inventoryAnalysis.push({
            title: p.title,
            stock: totalStock,
            avgDaily,
            daysOfStock,
            status
        });
    });

    // Sort by days of stock (critical first)
    inventoryAnalysis.sort((a, b) => {
        const aDays = typeof a.daysOfStock === 'number' ? a.daysOfStock : 999;
        const bDays = typeof b.daysOfStock === 'number' ? b.daysOfStock : 999;
        return aDays - bDays;
    });

    inventoryAnalysis.forEach(item => {
        console.log(`\n   ${item.title}:`);
        console.log(`      Stock: ${item.stock} units`);
        console.log(`      Avg daily sales: ${item.avgDaily.toFixed(2)} units`);
        console.log(`      Days of stock: ${item.daysOfStock}`);
        console.log(`      Status: ${item.status}`);
    });

    // Summary
    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('                    SUMMARY');
    console.log('═══════════════════════════════════════════════════════════\n');

    const critical = inventoryAnalysis.filter(i => i.status.includes('CRITICAL')).length;
    const low = inventoryAnalysis.filter(i => i.status.includes('LOW')).length;
    const outOfStock = inventoryAnalysis.filter(i => i.status.includes('OUT OF STOCK')).length;

    console.log(`   🔴 Critical (< 7 days): ${critical}`);
    console.log(`   🟠 Low stock (< 14 days): ${low}`);
    console.log(`   ⚫ Out of stock: ${outOfStock}`);
    console.log(`   📊 Products with sales data: ${Object.keys(productStats).length}`);

    // Check why forecast didn't work
    const productsWithEnoughData = Object.values(productStats).filter(p => p.days >= 7);
    console.log(`\n   Products with 7+ days of data (required for forecast): ${productsWithEnoughData.length}`);

    if (productsWithEnoughData.length === 0) {
        console.log('\n   ⚠️ FORECAST DIDN\'T RUN BECAUSE:');
        console.log('      No products have 7+ days of sales data yet.');
        console.log('      The sales aggregation started today - need more history.');
    }

    console.log('\n═══════════════════════════════════════════════════════════\n');
}

analyzeInventory().catch(console.error);
