-- Support Tickets System
-- Stores tickets created for eDarkStore and other support channels

-- Create tickets table
CREATE TABLE IF NOT EXISTS support_tickets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id TEXT UNIQUE NOT NULL, -- Human-readable ID like EDS-M1ABC-XY12
    conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
    client_id UUID REFERENCES clients(id) ON DELETE SET NULL,

    -- Ticket details
    type TEXT NOT NULL DEFAULT 'general_inquiry',
    subject TEXT NOT NULL,
    description TEXT,
    priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'pending', 'in_progress', 'resolved', 'closed')),

    -- Related data
    order_number TEXT,
    tracking_number TEXT,
    customer_email TEXT,
    customer_name TEXT,

    -- Recipient info
    recipient_type TEXT NOT NULL DEFAULT 'edarkstore', -- edarkstore, internal, supplier, etc.
    recipients TEXT[], -- Array of email recipients

    -- Tracking
    created_by UUID REFERENCES clients(id) ON DELETE SET NULL, -- Staff who created it
    resolved_by UUID REFERENCES clients(id) ON DELETE SET NULL,
    resolved_at TIMESTAMPTZ,
    external_message_id TEXT, -- Email message ID if sent via email

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for lookups
CREATE INDEX IF NOT EXISTS idx_tickets_conversation ON support_tickets(conversation_id);
CREATE INDEX IF NOT EXISTS idx_tickets_client ON support_tickets(client_id);
CREATE INDEX IF NOT EXISTS idx_tickets_status ON support_tickets(status);
CREATE INDEX IF NOT EXISTS idx_tickets_type ON support_tickets(type);
CREATE INDEX IF NOT EXISTS idx_tickets_ticket_id ON support_tickets(ticket_id);

-- Add trigger for updated_at
CREATE OR REPLACE FUNCTION update_tickets_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_tickets_updated_at ON support_tickets;
CREATE TRIGGER trigger_tickets_updated_at
    BEFORE UPDATE ON support_tickets
    FOR EACH ROW
    EXECUTE FUNCTION update_tickets_updated_at();

-- Enable RLS
ALTER TABLE support_tickets ENABLE ROW LEVEL SECURITY;

-- Policies for authenticated users (staff)
CREATE POLICY "Staff can view all tickets" ON support_tickets
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "Staff can insert tickets" ON support_tickets
    FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Staff can update tickets" ON support_tickets
    FOR UPDATE TO authenticated USING (true);

-- Add open_tickets count to conversations for quick lookup
-- We'll use a generated column or compute on-the-fly
-- For now, we can query tickets when needed

COMMENT ON TABLE support_tickets IS 'Support tickets for tracking issues sent to eDarkStore and other channels';
