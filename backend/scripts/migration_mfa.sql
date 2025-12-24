-- Enable MFA columns for Passwordless Admin
ALTER TABLE clients ADD COLUMN IF NOT EXISTS mfa_secret text;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS mfa_enabled boolean DEFAULT false;

-- Allow password_hash to be null (if not already)
ALTER TABLE clients ALTER COLUMN password_hash DROP NOT NULL;
