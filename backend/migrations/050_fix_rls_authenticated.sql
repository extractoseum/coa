-- =============================================
-- MIGRATION: FIX RLS FOR AUTHENTICATED USERS
-- Description: Grants SELECT access to 'authenticated' role for Realtime tables.
-- The previous hardening (047) only allowed 'anon', locking out logged-in admins.
-- =============================================

-- 1. CONVERSATIONS
DROP POLICY IF EXISTS "Authenticated Read Access" ON conversations;
CREATE POLICY "Authenticated Read Access" ON conversations FOR SELECT TO authenticated USING (true);

-- 2. CRM_MESSAGES
DROP POLICY IF EXISTS "Authenticated Read Access" ON crm_messages;
CREATE POLICY "Authenticated Read Access" ON crm_messages FOR SELECT TO authenticated USING (true);

-- 3. CRM_COLUMNS (Needed for layout sync)
DROP POLICY IF EXISTS "Authenticated Read Access" ON crm_columns;
CREATE POLICY "Authenticated Read Access" ON crm_columns FOR SELECT TO authenticated USING (true);

-- 4. CRM_CONTACT_SNAPSHOTS (Often queried live)
ALTER TABLE crm_contact_snapshots ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated Read Access" ON crm_contact_snapshots;
CREATE POLICY "Authenticated Read Access" ON crm_contact_snapshots FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Anon Read Access" ON crm_contact_snapshots;
CREATE POLICY "Anon Read Access" ON crm_contact_snapshots FOR SELECT TO anon USING (true);
DROP POLICY IF EXISTS "Service Role Full Access" ON crm_contact_snapshots;
CREATE POLICY "Service Role Full Access" ON crm_contact_snapshots FOR ALL TO service_role USING (true) WITH CHECK (true);

