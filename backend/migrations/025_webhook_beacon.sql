-- Webhook Beacon Logs for debugging
CREATE TABLE IF NOT EXISTS public.webhook_beacon_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    topic TEXT,
    payload JSONB,
    headers JSONB,
    received_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.webhook_beacon_logs ENABLE ROW LEVEL SECURITY;

-- Simple public read policy (it's a beacon for debugging)
CREATE POLICY "Public read for beacon" ON public.webhook_beacon_logs
    FOR SELECT USING (true);

-- Index for performance
CREATE INDEX IF NOT EXISTS idx_webhook_beacon_received_at ON public.webhook_beacon_logs(received_at DESC);
