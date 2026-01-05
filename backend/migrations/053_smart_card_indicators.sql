-- Migration 053: Smart Card Indicators
-- Adds columns for tracking first/last inbound interactions and traffic sources.

-- 1. Add columns to conversations
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS first_inbound_at TIMESTAMPTZ;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS last_inbound_at TIMESTAMPTZ;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS utm_source VARCHAR(100);
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS utm_campaign VARCHAR(100);
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS ad_platform VARCHAR(20); -- 'meta' | 'google' | null

-- 2. Create index for performance
CREATE INDEX IF NOT EXISTS idx_conv_last_inbound ON conversations(last_inbound_at);
CREATE INDEX IF NOT EXISTS idx_conv_traffic_source ON conversations(traffic_source);

-- 3. Update existing data (optional, set last_inbound_at to last_message_at for non-empty convs)
UPDATE conversations 
SET last_inbound_at = last_message_at 
WHERE last_inbound_at IS NULL;

-- 4. Create or replace view for indicators
CREATE OR REPLACE VIEW conversation_indicators AS
SELECT 
    c.id,
    c.contact_handle,
    c.last_message_at,
    c.last_inbound_at,
    c.first_inbound_at,
    c.traffic_source,
    
    -- Ventana 24h (en horas restantes)
    CASE 
        WHEN c.first_inbound_at IS NULL THEN 0
        ELSE GREATEST(0, 24 - EXTRACT(EPOCH FROM (NOW() - c.first_inbound_at)) / 3600)::int 
    END AS hours_remaining,
    
    -- Estado de ventana
    CASE 
        WHEN c.first_inbound_at IS NULL THEN 'expired'
        WHEN c.first_inbound_at > NOW() - INTERVAL '24 hours' THEN 'active'
        ELSE 'expired'
    END AS window_status,
    
    -- Tiempo desde último mensaje del cliente (horas)
    CASE 
        WHEN c.last_inbound_at IS NULL THEN 9999
        ELSE EXTRACT(EPOCH FROM (NOW() - c.last_inbound_at)) / 3600 
    END AS hours_since_customer,
    
    -- Estancado? (Más de 6 horas sin actividad total)
    (NOW() - c.last_message_at > INTERVAL '6 hours') AS is_stalled,
    
    -- Esperando respuesta? (Último mensaje fue inbound)
    EXISTS (
        SELECT 1 FROM crm_messages m 
        WHERE m.conversation_id = c.id 
        ORDER BY m.created_at DESC LIMIT 1
    ) AND (
        SELECT direction FROM crm_messages m 
        WHERE m.conversation_id = c.id 
        ORDER BY m.created_at DESC LIMIT 1
    ) = 'inbound' AS awaiting_response,
    
    -- Tipo de cliente
    COALESCE(s.orders_count, 0) = 0 AS is_new_customer,
    COALESCE(s.ltv, 0) > 5000 AS is_vip,
    
    -- Health score (Heuristic: friction vs intent)
    CASE 
        WHEN c.facts->>'friction_score' IS NOT NULL 
        THEN ((100 - (c.facts->>'friction_score')::int) * 
              COALESCE((c.facts->>'intent_score')::int, 50)) / 100
        ELSE 50
    END AS health_score

FROM conversations c
LEFT JOIN crm_contact_snapshots s ON s.handle = c.contact_handle;
