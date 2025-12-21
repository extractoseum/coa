
-- Add notification preference columns to clients table
ALTER TABLE clients 
ADD COLUMN IF NOT EXISTS whatsapp_notifications BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS sms_notifications BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS email_notifications BOOLEAN DEFAULT TRUE;

-- Refresh schema cache (Supabase specific, though usually automatic)
NOTIFY pgrst, 'reload schema';
