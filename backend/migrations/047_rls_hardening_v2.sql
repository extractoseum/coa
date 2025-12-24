-- =============================================
-- MIGRATION: RLS AUTHENTICATED ACCESS UPGRADE
-- Description: Allows authenticated admins to receive Realtime updates.
-- =============================================

-- 1. CONVERSATIONS
DROP POLICY IF EXISTS "Authenticated Select Access" ON conversations;
CREATE POLICY "Authenticated Select Access" ON conversations FOR SELECT TO authenticated USING (true);

-- 2. CRM_MESSAGES
DROP POLICY IF EXISTS "Authenticated Select Access" ON crm_messages;
CREATE POLICY "Authenticated Select Access" ON crm_messages FOR SELECT TO authenticated USING (true);

-- 3. CRM_COLUMNS
DROP POLICY IF EXISTS "Authenticated Select Access" ON crm_columns;
CREATE POLICY "Authenticated Select Access" ON crm_columns FOR SELECT TO authenticated USING (true);
