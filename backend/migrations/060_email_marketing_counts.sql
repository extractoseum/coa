-- 060_email_marketing_counts.sql
-- Add email marketing count columns to push_notifications

ALTER TABLE push_notifications
ADD COLUMN IF NOT EXISTS email_sent_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS email_failed_count INTEGER DEFAULT 0;

-- Comment
COMMENT ON COLUMN push_notifications.email_sent_count IS 'Number of marketing emails successfully sent';
COMMENT ON COLUMN push_notifications.email_failed_count IS 'Number of marketing emails that failed to send';
