-- Migration 078: Unified Contact View for Multi-Channel Cards
-- Aggregates conversations and voice calls across all channels for a single contact
-- Enables the CRM to show a unified "card" with WA, Voice, Telegram tabs

-- =============================================
-- 1. Add voice_call_count to contact_snapshots
-- =============================================
ALTER TABLE crm_contact_snapshots ADD COLUMN IF NOT EXISTS voice_calls_count INTEGER DEFAULT 0;
ALTER TABLE crm_contact_snapshots ADD COLUMN IF NOT EXISTS last_voice_call_at TIMESTAMPTZ;
ALTER TABLE crm_contact_snapshots ADD COLUMN IF NOT EXISTS total_call_duration_seconds INTEGER DEFAULT 0;

-- =============================================
-- 2. Create unified contact view
-- =============================================
CREATE OR REPLACE VIEW contact_unified_view AS
SELECT
    cs.id as snapshot_id,
    cs.handle as contact_handle,
    cs.name as contact_name,
    cs.channel as primary_channel,
    cs.ltv,
    cs.orders_count,
    cs.last_order_at,
    cs.average_ticket,
    cs.risk_level,
    cs.personality_traits,
    cs.tags,
    cs.summary_bullets,
    cs.last_updated_at,

    -- Voice metrics
    cs.voice_calls_count,
    cs.last_voice_call_at,
    cs.total_call_duration_seconds,

    -- Cross-channel activity summary
    GREATEST(cs.last_updated_at, cs.last_voice_call_at) as last_activity_at,

    -- All conversations for this contact (across channels)
    (
        SELECT COALESCE(json_agg(json_build_object(
            'id', c.id,
            'channel', c.channel,
            'status', c.status,
            'last_message_at', c.last_message_at,
            'traffic_source', c.traffic_source,
            'column_id', c.column_id
        ) ORDER BY c.last_message_at DESC), '[]'::json)
        FROM conversations c
        WHERE c.contact_handle = cs.handle
    ) as conversations,

    -- Count of conversations per channel
    (
        SELECT COALESCE(json_object_agg(channel, cnt), '{}'::json)
        FROM (
            SELECT channel, COUNT(*) as cnt
            FROM conversations
            WHERE contact_handle = cs.handle
            GROUP BY channel
        ) channel_counts
    ) as conversations_by_channel,

    -- Recent voice calls
    (
        SELECT COALESCE(json_agg(json_build_object(
            'id', vc.id,
            'call_sid', vc.vapi_call_id,
            'direction', vc.direction,
            'status', vc.status,
            'duration_seconds', vc.duration_seconds,
            'recording_url', vc.recording_url,
            'transcript', LEFT(vc.transcript, 500),
            'created_at', vc.created_at,
            'ended_at', vc.ended_at,
            'user_sentiment', vc.user_sentiment
        ) ORDER BY vc.created_at DESC), '[]'::json)
        FROM voice_calls vc
        WHERE vc.phone_number LIKE '%' || RIGHT(cs.handle, 10) || '%'
           OR cs.handle LIKE '%' || RIGHT(vc.phone_number, 10) || '%'
        LIMIT 10
    ) as voice_calls,

    -- Active channels array
    (
        SELECT COALESCE(array_agg(DISTINCT channel), ARRAY[]::text[])
        FROM (
            SELECT channel FROM conversations WHERE contact_handle = cs.handle
            UNION
            SELECT 'voice' WHERE EXISTS (
                SELECT 1 FROM voice_calls vc
                WHERE vc.phone_number LIKE '%' || RIGHT(cs.handle, 10) || '%'
            )
        ) channels
    ) as active_channels

FROM crm_contact_snapshots cs;

COMMENT ON VIEW contact_unified_view IS 'Unified view of contacts across all channels for multi-channel CRM cards';

-- =============================================
-- 3. Function to update snapshot voice metrics
-- =============================================
CREATE OR REPLACE FUNCTION update_snapshot_voice_metrics(p_phone TEXT)
RETURNS void AS $$
DECLARE
    v_clean_phone TEXT;
    v_call_count INTEGER;
    v_total_duration INTEGER;
    v_last_call TIMESTAMPTZ;
BEGIN
    -- Normalize phone (last 10 digits)
    v_clean_phone := RIGHT(regexp_replace(p_phone, '\D', '', 'g'), 10);

    -- Calculate metrics
    SELECT
        COUNT(*),
        COALESCE(SUM(duration_seconds), 0),
        MAX(created_at)
    INTO v_call_count, v_total_duration, v_last_call
    FROM voice_calls
    WHERE phone_number LIKE '%' || v_clean_phone || '%';

    -- Update snapshot if exists
    UPDATE crm_contact_snapshots
    SET
        voice_calls_count = v_call_count,
        total_call_duration_seconds = v_total_duration,
        last_voice_call_at = v_last_call,
        last_updated_at = NOW()
    WHERE handle LIKE '%' || v_clean_phone || '%';

END;
$$ LANGUAGE plpgsql;

-- =============================================
-- 4. Trigger to update metrics after voice call
-- =============================================
CREATE OR REPLACE FUNCTION trigger_update_voice_metrics()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.phone_number IS NOT NULL THEN
        PERFORM update_snapshot_voice_metrics(NEW.phone_number);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS voice_call_update_snapshot ON voice_calls;
CREATE TRIGGER voice_call_update_snapshot
    AFTER INSERT OR UPDATE ON voice_calls
    FOR EACH ROW
    EXECUTE FUNCTION trigger_update_voice_metrics();

-- =============================================
-- 5. Index for phone matching
-- =============================================
CREATE INDEX IF NOT EXISTS idx_voice_calls_phone_suffix
ON voice_calls(RIGHT(regexp_replace(phone_number, '\D', '', 'g'), 10));

CREATE INDEX IF NOT EXISTS idx_snapshots_handle_suffix
ON crm_contact_snapshots(RIGHT(regexp_replace(handle, '\D', '', 'g'), 10));

-- =============================================
-- 6. Backfill existing voice metrics
-- =============================================
DO $$
DECLARE
    snapshot RECORD;
BEGIN
    FOR snapshot IN SELECT DISTINCT handle FROM crm_contact_snapshots LOOP
        PERFORM update_snapshot_voice_metrics(snapshot.handle);
    END LOOP;
END $$;
