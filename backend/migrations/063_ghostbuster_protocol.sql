-- Migration 063: Ghostbuster Protocol
-- Table to track inactive customers and re-engagement attempts

CREATE TABLE IF NOT EXISTS ghost_alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id UUID REFERENCES clients(id),
    conversation_id UUID REFERENCES conversations(id), -- Optional link to specific convo
    
    -- Ghost Status
    ghost_level TEXT NOT NULL, -- warm_ghost (14-30), cold_ghost (31-60), frozen_ghost (61-90), churned (90+)
    days_inactive INTEGER NOT NULL,
    
    -- Context
    last_activity_type TEXT, -- order, message, browse, scan
    last_activity_at TIMESTAMPTZ,
    
    -- Reactivation State
    reactivation_status TEXT DEFAULT 'pending', -- pending, contacted, reactivated, churned, dismissed
    reactivation_channel TEXT, -- whatsapp, email
    reactivation_message TEXT,
    reactivation_sent_at TIMESTAMPTZ,
    
    -- Vibe Check (Snapshot at creation)
    vibe_at_creation TEXT, -- snapshot of client's vibe when ghost was detected
    friction_at_creation INTEGER,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Ensure one active alert per client at a time (optional, but good for noise reduction)
    -- We'll just index for now and handle logic in service
    UNIQUE(client_id, ghost_level, reactivation_status) 
);

CREATE INDEX IF NOT EXISTS idx_ghost_client ON ghost_alerts(client_id);
CREATE INDEX IF NOT EXISTS idx_ghost_level ON ghost_alerts(ghost_level);
CREATE INDEX IF NOT EXISTS idx_ghost_status ON ghost_alerts(reactivation_status);
CREATE INDEX IF NOT EXISTS idx_ghost_days ON ghost_alerts(days_inactive);

-- RLS
ALTER TABLE ghost_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service Role Full Access" ON ghost_alerts USING (auth.role() = 'service_role');
CREATE POLICY "Admins View Ghosts" ON ghost_alerts FOR SELECT USING (auth.role() = 'authenticated');
