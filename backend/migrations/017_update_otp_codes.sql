-- Migration to update otp_codes for multi-channel support provided by user request
-- Rename email to identifier to support phones
ALTER TABLE public.otp_codes RENAME COLUMN email TO identifier;

-- Add channel column to track how it was sent
ALTER TABLE public.otp_codes ADD COLUMN channel text DEFAULT 'email';

-- Add check constraint for valid channels
ALTER TABLE public.otp_codes ADD CONSTRAINT valid_channel CHECK (channel IN ('email', 'sms', 'whatsapp'));
