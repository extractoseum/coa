-- Migration: VIP Credential System for Club EUM Care
-- Date: 2024-12-16

-- Add membership/credential columns to clients table
ALTER TABLE clients ADD COLUMN IF NOT EXISTS credential_photo_url TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS membership_tier TEXT DEFAULT NULL;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS member_since TIMESTAMP;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS custom_member_id TEXT;

-- Create index for membership queries
CREATE INDEX IF NOT EXISTS idx_clients_membership_tier ON clients(membership_tier);

-- Comment on columns
COMMENT ON COLUMN clients.credential_photo_url IS 'URL of user-uploaded photo for VIP credential';
COMMENT ON COLUMN clients.membership_tier IS 'Membership level linked to Shopify tag';
COMMENT ON COLUMN clients.member_since IS 'Date when client became a Club member';
COMMENT ON COLUMN clients.custom_member_id IS 'Custom member ID (e.g., EUM-2024-001)';

-- Create membership_tiers table with Shopify tag mapping
CREATE TABLE IF NOT EXISTS membership_tiers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    shopify_tag TEXT NOT NULL UNIQUE,  -- Tag exacto en Shopify (e.g., "Club_partner_REV")
    color TEXT NOT NULL DEFAULT '#4F46E5',
    secondary_color TEXT DEFAULT '#818CF8',
    description TEXT,
    benefits JSONB DEFAULT '[]',
    sort_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Create index for tag lookup
CREATE INDEX IF NOT EXISTS idx_membership_tiers_shopify_tag ON membership_tiers(shopify_tag);

-- Insert default tiers with Shopify tag mapping
-- Tags: Club_partner (base), Gold_member, Platino_member, Black_member
INSERT INTO membership_tiers (id, name, shopify_tag, color, secondary_color, description, sort_order) VALUES
    ('Partner', 'Partner', 'Club_partner', '#4F46E5', '#818CF8', 'Membresía base del Club EUM Care', 1),
    ('Gold', 'Gold', 'Gold_member', '#D4AF37', '#F5D77A', 'Membresía Gold con beneficios adicionales', 2),
    ('Platinum', 'Platinum', 'Platino_member', '#A0A5AB', '#E5E4E2', 'Membresía Platinum premium', 3),
    ('Black', 'Black', 'Black_member', '#1a1a1a', '#374151', 'Membresía Black exclusiva', 4)
ON CONFLICT (id) DO NOTHING;
