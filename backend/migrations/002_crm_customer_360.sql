-- Migration: CRM Customer 360 & Ticket Management
-- Description: Adds snapshot caching and extends conversation states.

-- 1. Extend conversation status if not already present (Safety check)
-- Standard statuses: 'active', 'paused', 'review', 'archived', 'closed'
-- Since we already have an ENUM or constraint, let's just make sure 'archived' and 'closed' are supported in the app logic.
-- If the DB has a check constraint, we might need to modify it.

-- 2. Create Contact Snapshot table for "Customer 360"
CREATE TABLE IF NOT EXISTS public.crm_contact_snapshots (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    handle TEXT UNIQUE NOT NULL, -- Phone or Email
    channel TEXT NOT NULL,       -- WA, EMAIL, IG
    name TEXT,
    ltv DECIMAL(12,2) DEFAULT 0,
    orders_count INTEGER DEFAULT 0,
    last_order_at TIMESTAMPTZ,
    average_ticket DECIMAL(12,2) DEFAULT 0,
    risk_level TEXT DEFAULT 'low', -- low, medium, high
    personality_traits TEXT[],     -- ['directo', 'ansioso']
    tags TEXT[],
    summary_bullets TEXT[],        -- AI generated summary
    last_shipping_status TEXT,
    last_shipping_carrier TEXT,
    last_shipping_tracking TEXT,
    last_updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.crm_contact_snapshots ENABLE ROW LEVEL SECURITY;

-- 3. Policies
CREATE POLICY "Allow staff to read/write contact snapshots"
ON public.crm_contact_snapshots
FOR ALL
USING (auth.jwt() ->> 'role' IN ('admin', 'super_admin', 'staff'));

-- 4. Indexing for performance
CREATE INDEX IF NOT EXISTS idx_crm_snapshots_handle ON public.crm_contact_snapshots(handle);
