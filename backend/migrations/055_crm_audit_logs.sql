-- Migration 055: CRM Audit Logs
-- Creates a table for tracking system events, ghost data, and latency.

CREATE TABLE IF NOT EXISTS crm_audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_type VARCHAR(50) NOT NULL, -- 'INFO', 'ERROR', 'GHOST_DATA', 'LATENCY'
    component VARCHAR(50),           -- 'Controller', 'Service', 'ChipEngine'
    message TEXT NOT NULL,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for temporal queries
CREATE INDEX IF NOT EXISTS idx_crm_audit_created_at ON crm_audit_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_crm_audit_type ON crm_audit_logs(event_type);

-- RLS (Restrict to super admins or service role)
ALTER TABLE crm_audit_logs ENABLE ROW LEVEL SECURITY;

-- 1. Service Role Full Access (Backend/Admin)
DROP POLICY IF EXISTS "Service Role Full Access" ON crm_audit_logs;
CREATE POLICY "Service Role Full Access" ON crm_audit_logs 
    FOR ALL TO service_role 
    USING (true) 
    WITH CHECK (true);

-- 2. Authenticated Read Access (Admins)
DROP POLICY IF EXISTS "Authenticated Read Access" ON crm_audit_logs;
CREATE POLICY "Authenticated Read Access" ON crm_audit_logs 
    FOR SELECT TO authenticated 
    USING (
        EXISTS (
            SELECT 1 FROM public.clients 
            WHERE id::text = auth.uid()::text AND role = 'super_admin'
        )
    );
