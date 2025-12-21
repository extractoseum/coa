-- 027_enrich_order_tracking.sql
-- Add more metadata to order tracking to improve client dashboard experience

ALTER TABLE order_tracking 
ADD COLUMN IF NOT EXISTS tracking_code TEXT,
ADD COLUMN IF NOT EXISTS service_type TEXT;

COMMENT ON COLUMN order_tracking.tracking_code IS 'Inner carrier tracking code (e.g., Estafeta Tracking Code vs Waybill)';
COMMENT ON COLUMN order_tracking.service_type IS 'Carrier service type (e.g., Dia Sig., Terrestre)';
