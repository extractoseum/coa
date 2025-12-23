-- Add fulfilled_notified flag to orders table to prevent duplicate notifications
-- Mission Q: Alert Spam Mitigation

ALTER TABLE orders ADD COLUMN IF NOT EXISTS fulfilled_notified BOOLEAN DEFAULT FALSE;

-- Cleanup: Index for performance if needed
CREATE INDEX IF NOT EXISTS idx_orders_fulfilled_notified ON orders(fulfilled_notified) WHERE fulfilled_notified = FALSE;
