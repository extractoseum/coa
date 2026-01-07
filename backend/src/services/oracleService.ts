/**
 * Oracle Service - Smart Option A: Predictive Restocking
 *
 * This service handles:
 * 1. Customer restock predictions - When will customers need to reorder?
 * 2. Inventory demand forecasting - How much stock do we need in warehouse?
 * 3. Automated notifications for restocking reminders
 * 4. Sales history aggregation and trend analysis
 */

import { supabase } from '../config/supabase';
import { sendBulkWhatsApp, isWhapiConfigured } from './whapiService';
import { sendBulkMarketingEmail, isBulkEmailConfigured } from './emailService';

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

interface ProductConsumptionProfile {
    id: string;
    shopify_product_id: string | null;
    shopify_variant_id: string | null;
    product_title: string;
    variant_title: string | null;
    estimated_days_supply: number;
    category: string | null;
    size_ml: number | null;
    avg_reorder_days: number | null;
    reorder_sample_size: number;
}

interface RestockPrediction {
    id: string;
    client_id: string | null;
    customer_email: string | null;
    customer_phone: string | null;
    customer_name: string | null;
    shopify_product_id: string;
    product_title: string;
    last_purchase_date: string;
    predicted_restock_date: string;
    prediction_method: 'customer_history' | 'product_default' | 'category_average';
    confidence_score: number;
    notification_status: string;
    days_until_restock: number;
}

interface CustomerOrderHistory {
    customer_email: string;
    customer_phone: string | null;
    customer_name: string | null;
    client_id: string | null;
    shopify_product_id: string;
    shopify_variant_id: string | null;
    product_title: string;
    variant_title: string | null;
    order_dates: string[];
    quantities: number[];
    total_orders: number;
    avg_days_between_orders: number | null;
}

interface InventoryForecast {
    shopify_product_id: string;
    product_title: string;
    predicted_units: number;
    current_stock: number | null;
    days_of_stock_remaining: number | null;
    recommended_order_qty: number;
    is_low_stock: boolean;
    is_stockout_risk: boolean;
}

// ============================================================================
// CONFIGURATION
// ============================================================================

const ORACLE_CONFIG = {
    // How many days before predicted restock to send notification
    NOTIFICATION_DAYS_BEFORE: 5,

    // Minimum confidence score to send notification (0-100)
    MIN_CONFIDENCE_FOR_NOTIFICATION: 30,

    // Default days supply if no profile exists
    DEFAULT_DAYS_SUPPLY: 30,

    // Category defaults
    CATEGORY_DEFAULTS: {
        tincture: 30,
        capsule: 30,
        topical: 45,
        edible: 30,
        flower: 14,
        concentrate: 21,
        default: 30
    } as Record<string, number>,

    // Safety stock multiplier (e.g., 1.5 = 50% buffer)
    SAFETY_STOCK_MULTIPLIER: 1.5,

    // Reorder point = days of lead time worth of stock
    LEAD_TIME_DAYS: 14,

    // Low stock threshold (days of stock remaining)
    LOW_STOCK_THRESHOLD_DAYS: 14,

    // Stockout risk threshold (days of stock remaining)
    STOCKOUT_RISK_THRESHOLD_DAYS: 7
};

// ============================================================================
// CUSTOMER RESTOCK PREDICTIONS
// ============================================================================

/**
 * Get customer order history for a specific product
 * Analyzes past orders to determine reorder patterns
 */
export const getCustomerProductHistory = async (
    customerEmail: string,
    shopifyProductId: string
): Promise<CustomerOrderHistory | null> => {
    try {
        // Query orders from Shopify data (via shopify_customers_backup and orders if available)
        // For now, we'll use the line_items from orders table
        const { data: orders, error } = await supabase
            .from('orders')
            .select(`
                id,
                shopify_order_id,
                shopify_created_at,
                customer_email,
                customer_phone,
                line_items
            `)
            .eq('customer_email', customerEmail.toLowerCase())
            .order('shopify_created_at', { ascending: true });

        if (error || !orders || orders.length === 0) {
            return null;
        }

        // Filter orders containing this product
        const productOrders: { date: string; quantity: number }[] = [];

        for (const order of orders) {
            const lineItems = order.line_items as any[] | null;
            if (!lineItems) continue;

            for (const item of lineItems) {
                const itemProductId = String(item.product_id || item.shopify_product_id || '');
                if (itemProductId === shopifyProductId) {
                    productOrders.push({
                        date: order.shopify_created_at,
                        quantity: item.quantity || 1
                    });
                    break; // Only count once per order
                }
            }
        }

        if (productOrders.length === 0) {
            return null;
        }

        // Calculate average days between orders
        let avgDays: number | null = null;
        if (productOrders.length >= 2) {
            const daysBetween: number[] = [];
            for (let i = 1; i < productOrders.length; i++) {
                const prev = new Date(productOrders[i - 1].date);
                const curr = new Date(productOrders[i].date);
                const diffDays = Math.round((curr.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24));
                if (diffDays > 0 && diffDays < 365) { // Ignore outliers
                    daysBetween.push(diffDays);
                }
            }
            if (daysBetween.length > 0) {
                avgDays = Math.round(daysBetween.reduce((a, b) => a + b, 0) / daysBetween.length);
            }
        }

        // Get client_id if exists
        const { data: client } = await supabase
            .from('clients')
            .select('id, name')
            .eq('email', customerEmail.toLowerCase())
            .single();

        return {
            customer_email: customerEmail,
            customer_phone: orders[0].customer_phone,
            customer_name: client?.name || null,
            client_id: client?.id || null,
            shopify_product_id: shopifyProductId,
            shopify_variant_id: null,
            product_title: '', // Will be filled from product data
            variant_title: null,
            order_dates: productOrders.map(o => o.date),
            quantities: productOrders.map(o => o.quantity),
            total_orders: productOrders.length,
            avg_days_between_orders: avgDays
        };
    } catch (error) {
        console.error('[Oracle] Error getting customer product history:', error);
        return null;
    }
};

/**
 * Get or create consumption profile for a product
 */
export const getConsumptionProfile = async (
    shopifyProductId: string,
    shopifyVariantId?: string
): Promise<ProductConsumptionProfile | null> => {
    try {
        // Try to find exact match
        let query = supabase
            .from('product_consumption_profiles')
            .select('*')
            .eq('shopify_product_id', shopifyProductId);

        if (shopifyVariantId) {
            query = query.eq('shopify_variant_id', shopifyVariantId);
        }

        const { data: profile } = await query.single();

        if (profile) {
            return profile as ProductConsumptionProfile;
        }

        // Try to find by product only (without variant)
        const { data: productProfile } = await supabase
            .from('product_consumption_profiles')
            .select('*')
            .eq('shopify_product_id', shopifyProductId)
            .is('shopify_variant_id', null)
            .single();

        if (productProfile) {
            return productProfile as ProductConsumptionProfile;
        }

        return null;
    } catch (error) {
        console.error('[Oracle] Error getting consumption profile:', error);
        return null;
    }
};

/**
 * Calculate predicted restock date for a customer/product
 */
export const calculateRestockPrediction = async (
    customerEmail: string,
    shopifyProductId: string,
    shopifyVariantId?: string
): Promise<{
    predictedDate: Date;
    method: 'customer_history' | 'product_default' | 'category_average';
    confidence: number;
    daysSupply: number;
} | null> => {
    try {
        // Get customer's order history for this product
        const history = await getCustomerProductHistory(customerEmail, shopifyProductId);

        // Get product consumption profile
        const profile = await getConsumptionProfile(shopifyProductId, shopifyVariantId);

        // Get product info for category
        const { data: product } = await supabase
            .from('products')
            .select('title, product_type, tags')
            .eq('id', shopifyProductId)
            .single();

        let daysSupply: number;
        let method: 'customer_history' | 'product_default' | 'category_average';
        let confidence: number;
        let lastPurchaseDate: Date;

        // Priority 1: Customer's actual reorder history
        if (history && history.avg_days_between_orders && history.total_orders >= 2) {
            daysSupply = history.avg_days_between_orders;
            method = 'customer_history';
            // Higher confidence with more orders
            confidence = Math.min(90, 50 + (history.total_orders * 10));
            lastPurchaseDate = new Date(history.order_dates[history.order_dates.length - 1]);
        }
        // Priority 2: Product-specific profile
        else if (profile?.avg_reorder_days && profile.reorder_sample_size >= 5) {
            daysSupply = profile.avg_reorder_days;
            method = 'product_default';
            confidence = Math.min(70, 40 + (profile.reorder_sample_size * 2));
            lastPurchaseDate = history ? new Date(history.order_dates[history.order_dates.length - 1]) : new Date();
        }
        // Priority 3: Product profile estimated days
        else if (profile?.estimated_days_supply) {
            daysSupply = profile.estimated_days_supply;
            method = 'product_default';
            confidence = 50;
            lastPurchaseDate = history ? new Date(history.order_dates[history.order_dates.length - 1]) : new Date();
        }
        // Priority 4: Category average
        else {
            const category = product?.product_type?.toLowerCase() || 'default';
            daysSupply = ORACLE_CONFIG.CATEGORY_DEFAULTS[category] || ORACLE_CONFIG.DEFAULT_DAYS_SUPPLY;
            method = 'category_average';
            confidence = 30;
            lastPurchaseDate = history ? new Date(history.order_dates[history.order_dates.length - 1]) : new Date();
        }

        // Adjust for quantity (if customer bought multiple units, multiply days)
        if (history && history.quantities.length > 0) {
            const lastQuantity = history.quantities[history.quantities.length - 1];
            if (lastQuantity > 1) {
                daysSupply *= lastQuantity;
            }
        }

        // Calculate predicted date
        const predictedDate = new Date(lastPurchaseDate);
        predictedDate.setDate(predictedDate.getDate() + daysSupply);

        return {
            predictedDate,
            method,
            confidence,
            daysSupply
        };
    } catch (error) {
        console.error('[Oracle] Error calculating restock prediction:', error);
        return null;
    }
};

/**
 * Generate restock predictions for all customers
 * This is the main function called by the cron job
 */
export const generateRestockPredictions = async (): Promise<{
    created: number;
    updated: number;
    errors: number;
}> => {
    console.log('[Oracle] ========== Generating Restock Predictions ==========');

    let created = 0;
    let updated = 0;
    let errors = 0;

    try {
        // Get all recent orders with line items (last 180 days)
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - 180);

        const { data: orders, error: ordersError } = await supabase
            .from('orders')
            .select('customer_email, customer_phone, line_items, shopify_created_at')
            .gte('shopify_created_at', cutoffDate.toISOString())
            .not('customer_email', 'is', null);

        if (ordersError || !orders) {
            console.error('[Oracle] Error fetching orders:', ordersError);
            return { created, updated, errors: 1 };
        }

        console.log(`[Oracle] Processing ${orders.length} orders from last 180 days`);

        // Build map of customer -> products purchased
        const customerProducts = new Map<string, Set<string>>();

        for (const order of orders) {
            if (!order.customer_email || !order.line_items) continue;

            const email = order.customer_email.toLowerCase();
            if (!customerProducts.has(email)) {
                customerProducts.set(email, new Set());
            }

            const lineItems = order.line_items as any[];
            for (const item of lineItems) {
                const productId = String(item.product_id || item.shopify_product_id || '');
                if (productId) {
                    customerProducts.get(email)!.add(productId);
                }
            }
        }

        console.log(`[Oracle] Found ${customerProducts.size} unique customers with purchases`);

        // Generate predictions for each customer/product combination
        for (const [email, productIds] of customerProducts) {
            for (const productId of productIds) {
                try {
                    const prediction = await calculateRestockPrediction(email, productId);

                    if (!prediction) continue;

                    // Skip if predicted date is in the past
                    if (prediction.predictedDate < new Date()) continue;

                    // Get customer and product details
                    const history = await getCustomerProductHistory(email, productId);
                    const { data: product } = await supabase
                        .from('products')
                        .select('title')
                        .eq('id', productId)
                        .single();

                    // Upsert prediction
                    const predictionData = {
                        client_id: history?.client_id || null,
                        customer_email: email,
                        customer_phone: history?.customer_phone || null,
                        customer_name: history?.customer_name || null,
                        shopify_product_id: productId,
                        product_title: product?.title || 'Unknown Product',
                        last_purchase_date: history?.order_dates[history.order_dates.length - 1] || new Date().toISOString(),
                        predicted_restock_date: prediction.predictedDate.toISOString().split('T')[0],
                        prediction_method: prediction.method,
                        confidence_score: prediction.confidence,
                        customer_avg_reorder_days: history?.avg_days_between_orders || null,
                        customer_reorder_count: history?.total_orders || 1,
                        is_active: true,
                        updated_at: new Date().toISOString()
                    };

                    // Check if prediction exists
                    const { data: existing } = await supabase
                        .from('restock_predictions')
                        .select('id')
                        .eq('customer_email', email)
                        .eq('shopify_product_id', productId)
                        .eq('is_active', true)
                        .single();

                    if (existing) {
                        // Update existing
                        await supabase
                            .from('restock_predictions')
                            .update(predictionData)
                            .eq('id', existing.id);
                        updated++;
                    } else {
                        // Insert new
                        await supabase
                            .from('restock_predictions')
                            .insert(predictionData);
                        created++;
                    }
                } catch (err) {
                    errors++;
                    console.error(`[Oracle] Error processing ${email}/${productId}:`, err);
                }
            }
        }

        console.log(`[Oracle] Predictions complete: ${created} created, ${updated} updated, ${errors} errors`);

        return { created, updated, errors };
    } catch (error) {
        console.error('[Oracle] Error generating predictions:', error);
        return { created, updated, errors: 1 };
    }
};

// ============================================================================
// NOTIFICATION PROCESSING
// ============================================================================

/**
 * Process restock predictions and send notifications
 * Called daily by cron job
 */
export const processRestockNotifications = async (): Promise<{
    processed: number;
    notified: number;
    errors: number;
}> => {
    console.log('[Oracle] ========== Processing Restock Notifications ==========');

    let processed = 0;
    let notified = 0;
    let errors = 0;

    try {
        // Get predictions that are due for notification
        const notificationDate = new Date();
        notificationDate.setDate(notificationDate.getDate() + ORACLE_CONFIG.NOTIFICATION_DAYS_BEFORE);

        // Use the view that includes calculated days_until_restock
        const { data: predictions, error } = await supabase
            .from('restock_predictions_with_days')
            .select('*')
            .eq('is_active', true)
            .eq('notification_status', 'pending')
            .lte('predicted_restock_date', notificationDate.toISOString().split('T')[0])
            .gte('confidence_score', ORACLE_CONFIG.MIN_CONFIDENCE_FOR_NOTIFICATION);

        if (error || !predictions) {
            console.error('[Oracle] Error fetching predictions:', error);
            return { processed, notified, errors: 1 };
        }

        console.log(`[Oracle] Found ${predictions.length} predictions ready for notification`);

        for (const prediction of predictions) {
            processed++;

            try {
                const sent = await sendRestockReminder(prediction as RestockPrediction);

                if (sent) {
                    notified++;
                    // Update status
                    await supabase
                        .from('restock_predictions')
                        .update({
                            notification_status: 'sent',
                            notification_sent_at: new Date().toISOString(),
                            updated_at: new Date().toISOString()
                        })
                        .eq('id', prediction.id);
                }
            } catch (err) {
                errors++;
                console.error(`[Oracle] Error sending notification for ${prediction.id}:`, err);
            }
        }

        console.log(`[Oracle] Notifications complete: ${processed} processed, ${notified} notified, ${errors} errors`);

        return { processed, notified, errors };
    } catch (error) {
        console.error('[Oracle] Error processing notifications:', error);
        return { processed, notified, errors: 1 };
    }
};

/**
 * Send restock reminder to a customer
 */
const sendRestockReminder = async (prediction: RestockPrediction): Promise<boolean> => {
    const customerName = prediction.customer_name || 'Hola';
    const productName = prediction.product_title;

    // Build personalized message
    const message = buildRestockMessage(customerName, productName, prediction.days_until_restock);

    let sent = false;
    let channel = '';

    // Try WhatsApp first
    if (prediction.customer_phone && isWhapiConfigured()) {
        try {
            const result = await sendBulkWhatsApp(
                [prediction.customer_phone],
                message,
                `oracle_${prediction.id}`
            );
            if (result.sent > 0) {
                sent = true;
                channel = 'whatsapp';
            }
        } catch (err) {
            console.error('[Oracle] WhatsApp send failed:', err);
        }
    }

    // Try Email if WhatsApp failed or not available
    if (!sent && prediction.customer_email && isBulkEmailConfigured()) {
        try {
            const result = await sendBulkMarketingEmail(
                [prediction.customer_email],
                `Es hora de reabastecer tu ${productName}`,
                'Recordatorio de Reabastecimiento',
                message,
                `oracle_${prediction.id}`
            );
            if (result.sent > 0) {
                sent = true;
                channel = channel ? `${channel},email` : 'email';
            }
        } catch (err) {
            console.error('[Oracle] Email send failed:', err);
        }
    }

    // Log the notification
    if (sent) {
        await supabase.from('oracle_notification_log').insert({
            prediction_id: prediction.id,
            channel,
            message_content: message,
            status: 'sent'
        });
    }

    return sent;
};

/**
 * Build personalized restock reminder message
 */
const buildRestockMessage = (
    customerName: string,
    productName: string,
    daysUntil: number
): string => {
    if (daysUntil <= 0) {
        return `${customerName}! Calculamos que tu ${productName} ya se terminó o está por terminarse. ¿Te enviamos más? Responde "SI" para que te contactemos. Extractos EUM`;
    } else if (daysUntil <= 3) {
        return `${customerName}! Tu ${productName} está por terminarse en los próximos días. ¿Quieres que te enviemos más antes de que se acabe? Responde "SI". Extractos EUM`;
    } else {
        return `${customerName}! Calculamos que tu ${productName} durará aproximadamente ${daysUntil} días más. ¿Te gustaría reabastecerte antes de que se termine? Responde "SI" para ordenar. Extractos EUM`;
    }
};

// ============================================================================
// INVENTORY DEMAND FORECASTING
// ============================================================================

/**
 * Aggregate daily sales for a product
 * Called by cron job to build sales history
 */
export const aggregateDailySales = async (date?: Date): Promise<number> => {
    const targetDate = date || new Date();
    targetDate.setHours(0, 0, 0, 0);

    const dateStr = targetDate.toISOString().split('T')[0];
    console.log(`[Oracle] Aggregating sales for ${dateStr}`);

    try {
        // Get orders from this date
        const nextDay = new Date(targetDate);
        nextDay.setDate(nextDay.getDate() + 1);

        const { data: orders, error } = await supabase
            .from('orders')
            .select('line_items, customer_email, total_amount')
            .gte('shopify_created_at', targetDate.toISOString())
            .lt('shopify_created_at', nextDay.toISOString());

        if (error || !orders) {
            console.error('[Oracle] Error fetching orders for aggregation:', error);
            return 0;
        }

        // Aggregate by product
        const productSales = new Map<string, {
            units: number;
            revenue: number;
            orders: number;
            customers: Set<string>;
            title: string;
        }>();

        for (const order of orders) {
            const lineItems = order.line_items as any[] | null;
            if (!lineItems) continue;

            for (const item of lineItems) {
                const productId = String(item.product_id || '');
                if (!productId) continue;

                if (!productSales.has(productId)) {
                    productSales.set(productId, {
                        units: 0,
                        revenue: 0,
                        orders: 0,
                        customers: new Set(),
                        title: item.title || item.name || 'Unknown'
                    });
                }

                const sales = productSales.get(productId)!;
                sales.units += item.quantity || 1;
                sales.revenue += parseFloat(item.price || 0) * (item.quantity || 1);
                sales.orders += 1;
                if (order.customer_email) {
                    sales.customers.add(order.customer_email);
                }
            }
        }

        // Upsert into product_sales_history
        let inserted = 0;
        for (const [productId, sales] of productSales) {
            await supabase
                .from('product_sales_history')
                .upsert({
                    shopify_product_id: productId,
                    product_title: sales.title,
                    sale_date: dateStr,
                    units_sold: sales.units,
                    revenue: sales.revenue,
                    orders_count: sales.orders,
                    unique_customers: sales.customers.size
                }, {
                    onConflict: 'shopify_product_id,sale_date'
                });
            inserted++;
        }

        console.log(`[Oracle] Aggregated ${inserted} products for ${dateStr}`);
        return inserted;
    } catch (error) {
        console.error('[Oracle] Error aggregating sales:', error);
        return 0;
    }
};

/**
 * Generate inventory demand forecast
 * Predicts how much stock is needed for the upcoming period
 */
export const generateInventoryForecast = async (): Promise<{
    products: number;
    lowStockAlerts: number;
    stockoutRisks: number;
}> => {
    console.log('[Oracle] ========== Generating Inventory Forecast ==========');

    let products = 0;
    let lowStockAlerts = 0;
    let stockoutRisks = 0;

    try {
        // Get all products with sales history
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const { data: salesData, error } = await supabase
            .from('product_sales_history')
            .select('shopify_product_id, product_title, units_sold, sale_date')
            .gte('sale_date', thirtyDaysAgo.toISOString().split('T')[0]);

        if (error || !salesData) {
            console.error('[Oracle] Error fetching sales history:', error);
            return { products, lowStockAlerts, stockoutRisks };
        }

        // Aggregate by product
        const productStats = new Map<string, {
            title: string;
            totalUnits: number;
            days: number;
            dailySales: number[];
        }>();

        for (const sale of salesData) {
            if (!productStats.has(sale.shopify_product_id)) {
                productStats.set(sale.shopify_product_id, {
                    title: sale.product_title || 'Unknown',
                    totalUnits: 0,
                    days: 0,
                    dailySales: []
                });
            }

            const stats = productStats.get(sale.shopify_product_id)!;
            stats.totalUnits += sale.units_sold;
            stats.days += 1;
            stats.dailySales.push(sale.units_sold);
        }

        // Calculate forecasts
        const periodStart = new Date();
        periodStart.setDate(1); // First of current month
        const periodEnd = new Date(periodStart);
        periodEnd.setMonth(periodEnd.getMonth() + 1);
        periodEnd.setDate(0); // Last day of current month

        const daysInPeriod = Math.ceil((periodEnd.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));

        for (const [productId, stats] of productStats) {
            if (stats.days < 7) continue; // Need at least a week of data

            const avgDailySales = stats.totalUnits / stats.days;
            const predictedUnits = Math.ceil(avgDailySales * daysInPeriod);

            // Calculate trend (compare last 7 days to previous 7 days)
            let trendFactor = 1.0;
            if (stats.dailySales.length >= 14) {
                const recent7 = stats.dailySales.slice(-7).reduce((a, b) => a + b, 0);
                const prev7 = stats.dailySales.slice(-14, -7).reduce((a, b) => a + b, 0);
                if (prev7 > 0) {
                    trendFactor = recent7 / prev7;
                }
            }

            // Safety stock and reorder calculations
            const safetyStock = Math.ceil(avgDailySales * ORACLE_CONFIG.LEAD_TIME_DAYS * ORACLE_CONFIG.SAFETY_STOCK_MULTIPLIER);
            const reorderPoint = Math.ceil(avgDailySales * ORACLE_CONFIG.LEAD_TIME_DAYS) + safetyStock;

            // Get current inventory from Shopify (if available in products table)
            const { data: productData } = await supabase
                .from('products')
                .select('variants')
                .eq('id', productId)
                .single();

            let currentStock: number | null = null;
            let daysOfStock: number | null = null;

            if (productData?.variants) {
                const variants = productData.variants as any[];
                currentStock = variants.reduce((sum, v) => sum + (v.inventory_quantity || 0), 0);
                if (currentStock !== null && avgDailySales > 0) {
                    daysOfStock = Math.round(currentStock / avgDailySales);
                }
            }

            // Determine stock status
            const isLowStock = daysOfStock !== null && daysOfStock <= ORACLE_CONFIG.LOW_STOCK_THRESHOLD_DAYS;
            const isStockoutRisk = daysOfStock !== null && daysOfStock <= ORACLE_CONFIG.STOCKOUT_RISK_THRESHOLD_DAYS;

            if (isLowStock) lowStockAlerts++;
            if (isStockoutRisk) stockoutRisks++;

            // Calculate recommended order quantity
            const recommendedOrder = Math.max(0, predictedUnits + safetyStock - (currentStock || 0));

            // Upsert forecast
            await supabase
                .from('inventory_demand_forecast')
                .upsert({
                    shopify_product_id: productId,
                    product_title: stats.title,
                    forecast_period: 'monthly',
                    period_start: periodStart.toISOString().split('T')[0],
                    period_end: periodEnd.toISOString().split('T')[0],
                    predicted_units: Math.round(predictedUnits * trendFactor),
                    historical_avg_daily_sales: avgDailySales,
                    trend_factor: Math.round(trendFactor * 100) / 100,
                    current_stock: currentStock,
                    recommended_order_qty: recommendedOrder,
                    reorder_point: reorderPoint,
                    safety_stock: safetyStock,
                    days_of_stock_remaining: daysOfStock,
                    is_low_stock: isLowStock,
                    is_stockout_risk: isStockoutRisk,
                    stockout_risk_date: isStockoutRisk && daysOfStock !== null
                        ? new Date(Date.now() + daysOfStock * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
                        : null,
                    calculated_at: new Date().toISOString(),
                    data_points_used: stats.days
                }, {
                    onConflict: 'shopify_product_id,forecast_period,period_start'
                });

            products++;

            // Create alerts for low stock
            if (isStockoutRisk) {
                await createInventoryAlert(productId, stats.title, 'stockout_imminent', 'critical',
                    `${stats.title} tiene solo ${daysOfStock} días de stock. Riesgo de agotamiento.`);
            } else if (isLowStock) {
                await createInventoryAlert(productId, stats.title, 'low_stock', 'warning',
                    `${stats.title} tiene solo ${daysOfStock} días de stock. Considerar reordenar.`);
            }
        }

        console.log(`[Oracle] Forecast complete: ${products} products, ${lowStockAlerts} low stock, ${stockoutRisks} stockout risks`);

        return { products, lowStockAlerts, stockoutRisks };
    } catch (error) {
        console.error('[Oracle] Error generating forecast:', error);
        return { products, lowStockAlerts, stockoutRisks };
    }
};

/**
 * Create inventory alert
 */
const createInventoryAlert = async (
    productId: string,
    productTitle: string,
    alertType: string,
    severity: string,
    message: string
): Promise<void> => {
    try {
        // Check if similar alert already exists
        const { data: existing } = await supabase
            .from('inventory_alerts')
            .select('id')
            .eq('shopify_product_id', productId)
            .eq('alert_type', alertType)
            .eq('status', 'active')
            .single();

        if (existing) {
            // Update existing alert
            await supabase
                .from('inventory_alerts')
                .update({ message, created_at: new Date().toISOString() })
                .eq('id', existing.id);
        } else {
            // Create new alert
            await supabase.from('inventory_alerts').insert({
                shopify_product_id: productId,
                product_title: productTitle,
                alert_type: alertType,
                severity,
                message,
                status: 'active'
            });
        }
    } catch (error) {
        console.error('[Oracle] Error creating inventory alert:', error);
    }
};

// ============================================================================
// STATS & REPORTING
// ============================================================================

/**
 * Get Oracle system stats
 */
export const getOracleStats = async (): Promise<{
    predictions: {
        total: number;
        pending: number;
        sent: number;
        converted: number;
        conversionRate: number;
    };
    inventory: {
        productsTracked: number;
        lowStockCount: number;
        stockoutRiskCount: number;
    };
}> => {
    try {
        // Get prediction stats
        const { data: predStats } = await supabase
            .from('oracle_stats')
            .select('*')
            .single();

        // Get inventory stats
        const { data: invStats } = await supabase
            .from('inventory_demand_forecast')
            .select('is_low_stock, is_stockout_risk')
            .eq('forecast_period', 'monthly');

        const lowStockCount = invStats?.filter(i => i.is_low_stock).length || 0;
        const stockoutRiskCount = invStats?.filter(i => i.is_stockout_risk).length || 0;

        return {
            predictions: {
                total: predStats?.total_predictions || 0,
                pending: predStats?.pending_notifications || 0,
                sent: predStats?.sent_notifications || 0,
                converted: predStats?.conversions || 0,
                conversionRate: predStats?.conversion_rate || 0
            },
            inventory: {
                productsTracked: invStats?.length || 0,
                lowStockCount,
                stockoutRiskCount
            }
        };
    } catch (error) {
        console.error('[Oracle] Error getting stats:', error);
        return {
            predictions: { total: 0, pending: 0, sent: 0, converted: 0, conversionRate: 0 },
            inventory: { productsTracked: 0, lowStockCount: 0, stockoutRiskCount: 0 }
        };
    }
};

/**
 * Get low stock alerts
 */
export const getLowStockAlerts = async (): Promise<any[]> => {
    try {
        const { data } = await supabase
            .from('inventory_forecast_summary')
            .select('*')
            .or('is_low_stock.eq.true,is_stockout_risk.eq.true')
            .order('days_of_stock_remaining', { ascending: true });

        return data || [];
    } catch (error) {
        console.error('[Oracle] Error getting low stock alerts:', error);
        return [];
    }
};

/**
 * Mark a restock prediction as converted (customer reordered)
 */
export const markPredictionConverted = async (
    predictionId: string,
    orderId: string
): Promise<boolean> => {
    try {
        const { data: prediction } = await supabase
            .from('restock_predictions')
            .select('predicted_restock_date')
            .eq('id', predictionId)
            .single();

        if (!prediction) return false;

        const predictedDate = new Date(prediction.predicted_restock_date);
        const now = new Date();
        const daysBeforePrediction = Math.round((predictedDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

        await supabase
            .from('restock_predictions')
            .update({
                notification_status: 'converted',
                converted_at: now.toISOString(),
                conversion_order_id: orderId,
                days_before_prediction: daysBeforePrediction,
                is_active: false,
                updated_at: now.toISOString()
            })
            .eq('id', predictionId);

        return true;
    } catch (error) {
        console.error('[Oracle] Error marking prediction converted:', error);
        return false;
    }
};

// ============================================================================
// EXPORTS
// ============================================================================

export default {
    // Prediction functions
    generateRestockPredictions,
    processRestockNotifications,
    calculateRestockPrediction,

    // Inventory functions
    aggregateDailySales,
    generateInventoryForecast,
    getLowStockAlerts,

    // Stats & utility
    getOracleStats,
    markPredictionConverted,
    getConsumptionProfile
};
