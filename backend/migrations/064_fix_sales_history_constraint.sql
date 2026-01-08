-- Migration 064: Fix product_sales_history unique constraint
-- The upsert on (shopify_product_id, sale_date) requires a unique constraint

-- First, delete any duplicate entries if they exist
DELETE FROM product_sales_history a
USING product_sales_history b
WHERE a.id > b.id
AND a.shopify_product_id = b.shopify_product_id
AND a.sale_date = b.sale_date;

-- Add the unique constraint
ALTER TABLE product_sales_history
DROP CONSTRAINT IF EXISTS product_sales_history_shopify_product_id_sale_date_key;

ALTER TABLE product_sales_history
ADD CONSTRAINT product_sales_history_shopify_product_id_sale_date_key
UNIQUE (shopify_product_id, sale_date);

-- Also ensure inventory_demand_forecast has its constraint
ALTER TABLE inventory_demand_forecast
DROP CONSTRAINT IF EXISTS inventory_demand_forecast_product_period_key;

ALTER TABLE inventory_demand_forecast
ADD CONSTRAINT inventory_demand_forecast_product_period_key
UNIQUE (shopify_product_id, forecast_period, period_start);
