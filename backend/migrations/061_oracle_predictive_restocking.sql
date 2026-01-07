-- Migration 061: Oracle Predictive Restocking Utility Tables
-- Aligns database schema with existing oracleService.ts implementation

-- 1. Product Consumption Profiles
CREATE TABLE IF NOT EXISTS product_consumption_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shopify_product_id TEXT NOT NULL,
    shopify_variant_id TEXT,
    product_title TEXT NOT NULL,
    variant_title TEXT,
    
    -- Consumption logic
    estimated_days_supply INTEGER DEFAULT 30,
    category TEXT, -- tincture, capsule, etc.
    size_ml INTEGER,
    servings_per_unit INTEGER,
    
    -- Learnings
    avg_reorder_days INTEGER,
    reorder_sample_size INTEGER DEFAULT 0,
    
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(shopify_product_id, shopify_variant_id)
);

-- 2. Restock Predictions
CREATE TABLE IF NOT EXISTS restock_predictions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id UUID REFERENCES clients(id),
    customer_email TEXT,
    customer_phone TEXT,
    customer_name TEXT,
    
    shopify_product_id TEXT NOT NULL,
    product_title TEXT,
    
    last_purchase_date TIMESTAMPTZ,
    predicted_restock_date TIMESTAMPTZ,
    
    prediction_method TEXT, -- customer_history, product_default, category_average
    confidence_score INTEGER,
    
    customer_avg_reorder_days INTEGER,
    customer_reorder_count INTEGER,
    
    -- Notification State
    notification_status TEXT DEFAULT 'pending', -- pending, sent, converted, dismissed
    notification_sent_at TIMESTAMPTZ,
    
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_restock_email ON restock_predictions(customer_email);
CREATE INDEX IF NOT EXISTS idx_restock_date ON restock_predictions(predicted_restock_date);
CREATE INDEX IF NOT EXISTS idx_restock_status ON restock_predictions(notification_status);

-- 3. Product Sales History (for forecasting)
CREATE TABLE IF NOT EXISTS product_sales_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shopify_product_id TEXT NOT NULL,
    product_title TEXT,
    
    sale_date DATE NOT NULL,
    units_sold INTEGER DEFAULT 0,
    revenue DECIMAL(10,2) DEFAULT 0,
    orders_count INTEGER DEFAULT 0,
    unique_customers INTEGER DEFAULT 0,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(shopify_product_id, sale_date)
);

-- 4. Inventory Alerts
CREATE TABLE IF NOT EXISTS inventory_alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type TEXT NOT NULL, -- low_stock, stockout_risk, unusual_demand
    severity TEXT NOT NULL, -- low, medium, high, critical
    
    shopify_product_id TEXT,
    product_title TEXT,
    
    message TEXT,
    data JSONB DEFAULT '{}'::JSONB,
    
    status TEXT DEFAULT 'active', -- active, acknowledged, resolved
    acknowledged_by UUID, -- client_id if applicable
    acknowledged_at TIMESTAMPTZ,
    resolved_at TIMESTAMPTZ,
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Oracle Notification Log
CREATE TABLE IF NOT EXISTS oracle_notification_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    prediction_id UUID REFERENCES restock_predictions(id),
    channel TEXT, -- whatsapp, email
    message_content TEXT,
    status TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. Helper View: Days Until Restock
CREATE OR REPLACE VIEW restock_predictions_with_days AS
SELECT 
    *,
    EXTRACT(DAY FROM (predicted_restock_date - NOW()))::int AS days_until_restock
FROM restock_predictions;

-- RLS
ALTER TABLE product_consumption_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE restock_predictions ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_sales_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE oracle_notification_log ENABLE ROW LEVEL SECURITY;

-- Simple logic: Service Role full access, Authenticated Read Access (for admins)
CREATE POLICY "Service Role Full Access" ON product_consumption_profiles USING (auth.role() = 'service_role');
CREATE POLICY "Admins View Profiles" ON product_consumption_profiles FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Service Role Full Access" ON restock_predictions USING (auth.role() = 'service_role');
CREATE POLICY "Admins View Predictions" ON restock_predictions FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Service Role Full Access" ON product_sales_history USING (auth.role() = 'service_role');
CREATE POLICY "Admins View Sales" ON product_sales_history FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Service Role Full Access" ON inventory_alerts USING (auth.role() = 'service_role');
CREATE POLICY "Admins View Alerts" ON inventory_alerts FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Service Role Full Access" ON oracle_notification_log USING (auth.role() = 'service_role');
CREATE POLICY "Admins View Logs" ON oracle_notification_log FOR SELECT USING (auth.role() = 'authenticated');