-- Migration 056.2: Refine Indicators View (Final Fix)
-- Removes total_messages column and ensures correct window calculation.

CREATE OR REPLACE VIEW conversation_indicators AS
WITH last_inbound_msg AS (
    SELECT 
        conversation_id, 
        MAX(created_at) as latest_inbound
    FROM crm_messages
    WHERE direction = 'inbound' 
    GROUP BY conversation_id
)
SELECT 
    c.id,
    c.contact_handle,
    c.last_message_at,
    c.last_inbound_at,
    c.first_inbound_at,
    c.traffic_source,
    
    -- Dynamic 24h Window Calculation
    CASE 
        WHEN COALESCE(c.last_inbound_at, li.latest_inbound) IS NULL THEN 0
        ELSE GREATEST(0, 24 - EXTRACT(EPOCH FROM (NOW() - COALESCE(c.last_inbound_at, li.latest_inbound))) / 3600)::int 
    END AS hours_remaining,
    
    -- Dynamic Window Status
    CASE 
        WHEN COALESCE(c.last_inbound_at, li.latest_inbound) IS NULL THEN 'expired'
        WHEN COALESCE(c.last_inbound_at, li.latest_inbound) > NOW() - INTERVAL '24 hours' THEN 'active'
        ELSE 'expired'
    END AS window_status,
    
    -- Stats
    CASE 
        WHEN c.last_inbound_at IS NULL THEN 9999
        ELSE EXTRACT(EPOCH FROM (NOW() - c.last_inbound_at)) / 3600 
    END AS hours_since_customer,
    
    -- Stalled Check
    (NOW() - c.last_message_at > INTERVAL '6 hours') AS is_stalled,
    
    -- Awaiting response check
    EXISTS (
        SELECT 1 FROM crm_messages m 
        WHERE m.conversation_id = c.id 
        ORDER BY m.created_at DESC LIMIT 1
    ) AND (
        SELECT direction FROM crm_messages m 
        WHERE m.conversation_id = c.id 
        ORDER BY m.created_at DESC LIMIT 1
    ) = 'inbound' AS awaiting_response,
    
    COALESCE(s.orders_count, 0) = 0 AS is_new_customer,
    COALESCE(s.ltv, 0) > 5000 AS is_vip,
    
    CASE 
        WHEN c.facts->>'friction_score' IS NOT NULL 
        THEN ((100 - (c.facts->>'friction_score')::int) * 
              COALESCE((c.facts->>'intent_score')::int, 50)) / 100
        WHEN c.facts->>'intent_score' IS NOT NULL 
        THEN (c.facts->>'intent_score')::int
        ELSE 70
    END AS health_score

FROM conversations c
LEFT JOIN crm_contact_snapshots s ON s.handle = c.contact_handle
LEFT JOIN last_inbound_msg li ON li.conversation_id = c.id;
