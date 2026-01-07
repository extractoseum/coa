-- 061_oracle_predictive_restocking.sql
-- Smart Option A: "The Oracle" - Predictive Restocking System
-- Predicts when customers will need to restock and notifies them proactively

-- ============================================================================
-- PRODUCT CONSUMPTION PROFILES
-- Stores estimated duration/consumption rate for products
-- ============================================================================
CREATE TABLE IF NOT EXISTS product_consumption_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Product identification (can be Shopify product or variant)
    shopify_product_id TEXT,
    shopify_variant_id TEXT,
    product_title TEXT NOT NULL,
    variant_title TEXT,

    -- Consumption estimates
    estimated_days_supply INTEGER NOT NULL DEFAULT 30,  -- How many days a single unit lasts
    category TEXT,  -- tincture, capsule, topical, edible, flower, etc.
    size_ml DECIMAL(10,2),  -- For tinctures: 15ml, 30ml, 60ml
    servings_per_unit INTEGER,  -- Number of servings in a single purchase

    -- For learning from actual customer behavior
    avg_reorder_days DECIMAL(10,2),  -- Calculated from actual orders
    reorder_sample_size INTEGER DEFAULT 0,  -- How many customers this is based on

    -- Metadata
    is_active BOOLEAN DEFAULT true,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Unique constraint on product/variant combination
CREATE UNIQUE INDEX IF NOT EXISTS idx_consumption_product_variant
ON product_consumption_profiles(shopify_product_id, COALESCE(shopify_variant_id, ''));

CREATE INDEX IF NOT EXISTS idx_consumption_category ON product_consumption_profiles(category);
CREATE INDEX IF NOT EXISTS idx_consumption_active ON product_consumption_profiles(is_active);

-- ============================================================================
-- RESTOCK PREDICTIONS
-- Tracks predicted restock dates and notification status per customer/product
-- ============================================================================
CREATE TABLE IF NOT EXISTS restock_predictions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Customer identification
    client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
    shopify_customer_id TEXT,
    customer_email TEXT,
    customer_phone TEXT,
    customer_name TEXT,

    -- Product that needs restocking
    shopify_product_id TEXT NOT NULL,
    shopify_variant_id TEXT,
    product_title TEXT NOT NULL,
    variant_title TEXT,

    -- Purchase history for this product
    last_purchase_date TIMESTAMP WITH TIME ZONE NOT NULL,
    last_order_id TEXT,  -- Shopify order ID
    quantity_purchased INTEGER DEFAULT 1,

    -- Prediction data
    predicted_restock_date DATE NOT NULL,
    prediction_method TEXT NOT NULL,  -- 'customer_history' | 'product_default' | 'category_average'
    confidence_score DECIMAL(5,2) DEFAULT 50,  -- 0-100, higher = more confident
    -- Note: days_until_restock is calculated dynamically in queries as (predicted_restock_date - CURRENT_DATE)

    -- Customer's personal reorder pattern (if we have history)
    customer_avg_reorder_days DECIMAL(10,2),
    customer_reorder_count INTEGER DEFAULT 0,  -- How many times they've reordered this product

    -- Notification tracking
    notification_status TEXT DEFAULT 'pending',  -- pending | scheduled | sent | converted | ignored | unsubscribed
    notification_scheduled_for DATE,  -- When we plan to send the reminder
    notification_sent_at TIMESTAMP WITH TIME ZONE,
    notification_channel TEXT,  -- push | whatsapp | email | multi
    notification_id UUID,  -- Reference to push_notifications if sent via that system

    -- Conversion tracking
    converted_at TIMESTAMP WITH TIME ZONE,  -- When they actually reordered
    conversion_order_id TEXT,  -- The new order ID if they converted
    days_before_prediction INTEGER,  -- How many days before/after prediction they reordered (negative = early)

    -- Metadata
    is_active BOOLEAN DEFAULT true,  -- False if customer unsubscribed or product discontinued
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_restock_client ON restock_predictions(client_id);
CREATE INDEX IF NOT EXISTS idx_restock_email ON restock_predictions(customer_email);
CREATE INDEX IF NOT EXISTS idx_restock_product ON restock_predictions(shopify_product_id);
CREATE INDEX IF NOT EXISTS idx_restock_predicted_date ON restock_predictions(predicted_restock_date);
CREATE INDEX IF NOT EXISTS idx_restock_notification_status ON restock_predictions(notification_status);
CREATE INDEX IF NOT EXISTS idx_restock_active ON restock_predictions(is_active);

-- Unique constraint: one active prediction per customer/product combination
CREATE UNIQUE INDEX IF NOT EXISTS idx_restock_unique_active
ON restock_predictions(COALESCE(client_id::text, customer_email), shopify_product_id, COALESCE(shopify_variant_id, ''))
WHERE is_active = true;

-- ============================================================================
-- ORACLE NOTIFICATION LOG
-- Detailed log of all Oracle-generated notifications
-- ============================================================================
CREATE TABLE IF NOT EXISTS oracle_notification_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    prediction_id UUID REFERENCES restock_predictions(id) ON DELETE CASCADE,

    -- Notification details
    channel TEXT NOT NULL,  -- push | whatsapp | email
    message_template TEXT,  -- Which template was used
    message_content TEXT,  -- Actual message sent

    -- Status
    status TEXT NOT NULL,  -- queued | sent | delivered | failed
    error_message TEXT,

    -- Response tracking
    opened_at TIMESTAMP WITH TIME ZONE,
    clicked_at TIMESTAMP WITH TIME ZONE,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_oracle_log_prediction ON oracle_notification_log(prediction_id);
CREATE INDEX IF NOT EXISTS idx_oracle_log_status ON oracle_notification_log(status);

-- ============================================================================
-- ORACLE STATS VIEW
-- Aggregated statistics for the Oracle system
-- ============================================================================
CREATE OR REPLACE VIEW oracle_stats AS
SELECT
    COUNT(*) AS total_predictions,
    COUNT(*) FILTER (WHERE is_active = true) AS active_predictions,
    COUNT(*) FILTER (WHERE notification_status = 'pending') AS pending_notifications,
    COUNT(*) FILTER (WHERE notification_status = 'sent') AS sent_notifications,
    COUNT(*) FILTER (WHERE notification_status = 'converted') AS conversions,
    ROUND(
        100.0 * COUNT(*) FILTER (WHERE notification_status = 'converted') /
        NULLIF(COUNT(*) FILTER (WHERE notification_status = 'sent'), 0),
        2
    ) AS conversion_rate,
    COUNT(DISTINCT customer_email) AS unique_customers,
    COUNT(DISTINCT shopify_product_id) AS unique_products,
    AVG(confidence_score) FILTER (WHERE notification_status = 'converted') AS avg_converted_confidence,
    AVG(days_before_prediction) FILTER (WHERE notification_status = 'converted') AS avg_days_early
FROM restock_predictions;

-- ============================================================================
-- RESTOCK PREDICTIONS WITH DAYS VIEW
-- Adds calculated days_until_restock for convenience
-- ============================================================================
CREATE OR REPLACE VIEW restock_predictions_with_days AS
SELECT
    *,
    (predicted_restock_date - CURRENT_DATE) AS days_until_restock
FROM restock_predictions;

-- ============================================================================
-- DEFAULT CONSUMPTION PROFILES
-- Pre-populate with common product types
-- ============================================================================
INSERT INTO product_consumption_profiles (product_title, category, estimated_days_supply, size_ml, notes)
VALUES
    ('Tincture 30ml (Default)', 'tincture', 30, 30, 'Standard 30ml tincture, ~30 day supply at 1ml/day'),
    ('Tincture 15ml (Default)', 'tincture', 15, 15, 'Small 15ml tincture, ~15 day supply at 1ml/day'),
    ('Tincture 60ml (Default)', 'tincture', 60, 60, 'Large 60ml tincture, ~60 day supply at 1ml/day'),
    ('Capsules 30ct (Default)', 'capsule', 30, NULL, '30 capsules, 1 per day'),
    ('Capsules 60ct (Default)', 'capsule', 60, NULL, '60 capsules, 1 per day'),
    ('Topical (Default)', 'topical', 45, NULL, 'Topical cream/balm, ~45 day supply'),
    ('Edibles (Default)', 'edible', 30, NULL, 'Edible pack, ~30 day supply'),
    ('Flower 3.5g (Default)', 'flower', 14, NULL, 'Eighth of flower, ~2 week supply'),
    ('Flower 7g (Default)', 'flower', 28, NULL, 'Quarter of flower, ~4 week supply')
ON CONFLICT DO NOTHING;

-- ============================================================================
-- COMMENTS
-- ============================================================================
COMMENT ON TABLE product_consumption_profiles IS 'Stores estimated consumption rates for products to power restock predictions';
COMMENT ON TABLE restock_predictions IS 'Tracks predicted restock dates and notification status for customers';
COMMENT ON TABLE oracle_notification_log IS 'Detailed log of all Oracle-generated restock notifications';
COMMENT ON VIEW oracle_stats IS 'Aggregated statistics for the Oracle predictive restocking system';
COMMENT ON VIEW restock_predictions_with_days IS 'Restock predictions with dynamically calculated days_until_restock';

COMMENT ON COLUMN restock_predictions.prediction_method IS 'How the prediction was calculated: customer_history (best), product_default, or category_average';
COMMENT ON COLUMN restock_predictions.confidence_score IS 'Confidence in prediction 0-100. Higher for customers with more reorder history';
COMMENT ON COLUMN restock_predictions.days_before_prediction IS 'Negative = customer reordered early, Positive = late, 0 = exactly on time';

-- ============================================================================
-- INVENTORY DEMAND FORECASTING
-- Predicts how much stock you need to order for your warehouse
-- ============================================================================
CREATE TABLE IF NOT EXISTS inventory_demand_forecast (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Product identification
    shopify_product_id TEXT NOT NULL,
    shopify_variant_id TEXT,
    product_title TEXT NOT NULL,
    variant_title TEXT,
    sku TEXT,

    -- Forecast period
    forecast_period TEXT NOT NULL,  -- 'weekly' | 'monthly' | 'quarterly'
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,

    -- Demand predictions
    predicted_units INTEGER NOT NULL,  -- How many units expected to sell
    predicted_revenue DECIMAL(12,2),  -- Expected revenue
    confidence_level TEXT DEFAULT 'medium',  -- low | medium | high

    -- Calculation basis
    historical_avg_daily_sales DECIMAL(10,4),  -- Average daily sales
    trend_factor DECIMAL(5,2) DEFAULT 1.0,  -- >1 = growing, <1 = declining
    seasonality_factor DECIMAL(5,2) DEFAULT 1.0,  -- Seasonal adjustment

    -- Inventory recommendations
    current_stock INTEGER,  -- Current inventory level (if synced)
    recommended_order_qty INTEGER,  -- How many to order
    reorder_point INTEGER,  -- When to trigger reorder
    safety_stock INTEGER,  -- Buffer stock to maintain
    days_of_stock_remaining INTEGER,  -- At current sales rate

    -- Alert flags
    is_low_stock BOOLEAN DEFAULT false,
    is_stockout_risk BOOLEAN DEFAULT false,
    stockout_risk_date DATE,  -- When we predict stockout

    -- Metadata
    calculated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    data_points_used INTEGER,  -- How many historical data points
    notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_inventory_forecast_product ON inventory_demand_forecast(shopify_product_id);
CREATE INDEX IF NOT EXISTS idx_inventory_forecast_period ON inventory_demand_forecast(forecast_period, period_start);
CREATE INDEX IF NOT EXISTS idx_inventory_forecast_low_stock ON inventory_demand_forecast(is_low_stock) WHERE is_low_stock = true;
CREATE INDEX IF NOT EXISTS idx_inventory_forecast_stockout ON inventory_demand_forecast(is_stockout_risk) WHERE is_stockout_risk = true;

-- Unique: one forecast per product/period combination
CREATE UNIQUE INDEX IF NOT EXISTS idx_inventory_forecast_unique
ON inventory_demand_forecast(shopify_product_id, COALESCE(shopify_variant_id, ''), forecast_period, period_start);

-- ============================================================================
-- PRODUCT SALES HISTORY
-- Aggregated daily sales for trend analysis
-- ============================================================================
CREATE TABLE IF NOT EXISTS product_sales_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    shopify_product_id TEXT NOT NULL,
    shopify_variant_id TEXT,
    product_title TEXT,

    -- Daily aggregation
    sale_date DATE NOT NULL,
    units_sold INTEGER DEFAULT 0,
    revenue DECIMAL(12,2) DEFAULT 0,
    orders_count INTEGER DEFAULT 0,
    unique_customers INTEGER DEFAULT 0,

    -- Running averages (updated daily)
    avg_7_day DECIMAL(10,4),  -- 7-day moving average
    avg_30_day DECIMAL(10,4),  -- 30-day moving average
    avg_90_day DECIMAL(10,4),  -- 90-day moving average

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_sales_history_unique
ON product_sales_history(shopify_product_id, COALESCE(shopify_variant_id, ''), sale_date);

CREATE INDEX IF NOT EXISTS idx_sales_history_date ON product_sales_history(sale_date);
CREATE INDEX IF NOT EXISTS idx_sales_history_product ON product_sales_history(shopify_product_id);

-- ============================================================================
-- INVENTORY ALERTS
-- Notifications about inventory issues
-- ============================================================================
CREATE TABLE IF NOT EXISTS inventory_alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    shopify_product_id TEXT NOT NULL,
    shopify_variant_id TEXT,
    product_title TEXT NOT NULL,

    alert_type TEXT NOT NULL,  -- 'low_stock' | 'stockout_imminent' | 'stockout' | 'overstock' | 'trending_up'
    severity TEXT NOT NULL,  -- 'info' | 'warning' | 'critical'

    message TEXT NOT NULL,
    details JSONB,  -- Additional context

    -- Status
    status TEXT DEFAULT 'active',  -- active | acknowledged | resolved
    acknowledged_by UUID,
    acknowledged_at TIMESTAMP WITH TIME ZONE,
    resolved_at TIMESTAMP WITH TIME ZONE,

    -- Notification
    notification_sent BOOLEAN DEFAULT false,
    notification_sent_at TIMESTAMP WITH TIME ZONE,
    notification_channel TEXT,  -- email | push | slack

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_inventory_alerts_product ON inventory_alerts(shopify_product_id);
CREATE INDEX IF NOT EXISTS idx_inventory_alerts_status ON inventory_alerts(status);
CREATE INDEX IF NOT EXISTS idx_inventory_alerts_type ON inventory_alerts(alert_type);
CREATE INDEX IF NOT EXISTS idx_inventory_alerts_severity ON inventory_alerts(severity);

-- ============================================================================
-- INVENTORY STATS VIEW
-- Dashboard view for inventory forecasting
-- ============================================================================
CREATE OR REPLACE VIEW inventory_forecast_summary AS
SELECT
    f.shopify_product_id,
    f.product_title,
    f.variant_title,
    f.sku,
    f.current_stock,
    f.days_of_stock_remaining,
    f.predicted_units AS predicted_monthly_demand,
    f.recommended_order_qty,
    f.reorder_point,
    f.is_low_stock,
    f.is_stockout_risk,
    f.stockout_risk_date,
    f.historical_avg_daily_sales,
    f.trend_factor,
    f.confidence_level,
    f.calculated_at,
    -- Alert status
    (SELECT COUNT(*) FROM inventory_alerts a
     WHERE a.shopify_product_id = f.shopify_product_id
     AND a.status = 'active') AS active_alerts
FROM inventory_demand_forecast f
WHERE f.forecast_period = 'monthly'
AND f.period_start = DATE_TRUNC('month', CURRENT_DATE)
ORDER BY
    f.is_stockout_risk DESC,
    f.days_of_stock_remaining ASC NULLS FIRST;

-- ============================================================================
-- COMMENTS
-- ============================================================================
COMMENT ON TABLE inventory_demand_forecast IS 'Predicts future product demand to help with warehouse stocking';
COMMENT ON TABLE product_sales_history IS 'Daily aggregated sales data for trend analysis';
COMMENT ON TABLE inventory_alerts IS 'Alerts about inventory issues (low stock, stockout risk, etc.)';
COMMENT ON VIEW inventory_forecast_summary IS 'Dashboard view showing current inventory status and predictions';

COMMENT ON COLUMN inventory_demand_forecast.trend_factor IS 'Sales trend: >1 means growing demand, <1 means declining';
COMMENT ON COLUMN inventory_demand_forecast.seasonality_factor IS 'Seasonal adjustment factor based on historical patterns';
COMMENT ON COLUMN inventory_demand_forecast.safety_stock IS 'Buffer inventory to maintain as protection against stockouts';
