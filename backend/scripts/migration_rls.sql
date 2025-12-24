-- =============================================
-- MIGRATION: ENABLE ROW LEVEL SECURITY (RLS)
-- Description: Fixes Security Advisor warnings.
-- Strategy:
-- 1. Enable RLS on all tables.
-- 2. Grant FULL ACCESS to 'service_role' (Backend/Admin).
-- 3. Grant READ ACCESS to 'anon' for Realtime tables (conversations, messages, etc).
-- 4. Default DENY for everything else for 'anon'.
-- =============================================

-- 1. CONVERSATIONS
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service Role Full Access" ON conversations;
CREATE POLICY "Service Role Full Access" ON conversations FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Anon Read Access" ON conversations;
CREATE POLICY "Anon Read Access" ON conversations FOR SELECT TO anon USING (true);

-- 2. CRM_MESSAGES
ALTER TABLE crm_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service Role Full Access" ON crm_messages;
CREATE POLICY "Service Role Full Access" ON crm_messages FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Anon Read Access" ON crm_messages;
CREATE POLICY "Anon Read Access" ON crm_messages FOR SELECT TO anon USING (true);

-- 3. FACTS
ALTER TABLE facts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service Role Full Access" ON facts;
CREATE POLICY "Service Role Full Access" ON facts FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Anon Read Access" ON facts;
CREATE POLICY "Anon Read Access" ON facts FOR SELECT TO anon USING (true);

-- 4. CRM_COLUMNS (Needed for Board Layout)
ALTER TABLE crm_columns ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service Role Full Access" ON crm_columns;
CREATE POLICY "Service Role Full Access" ON crm_columns FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Anon Read Access" ON crm_columns;
CREATE POLICY "Anon Read Access" ON crm_columns FOR SELECT TO anon USING (true);

-- 5. CLIENTS (Sensitive - Service Role Only)
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service Role Full Access" ON clients;
CREATE POLICY "Service Role Full Access" ON clients FOR ALL TO service_role USING (true) WITH CHECK (true);
-- Anon cannot read clients

-- 6. ORDERS (Sensitive - Service Role Only)
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service Role Full Access" ON orders;
CREATE POLICY "Service Role Full Access" ON orders FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 7. PRODUCTS (Maybe public read needed? For now Service Only to be safe, unless Storefront uses it directly)
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service Role Full Access" ON products;
CREATE POLICY "Service Role Full Access" ON products FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 8. SYSTEM_LOGS
ALTER TABLE system_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service Role Full Access" ON system_logs;
CREATE POLICY "Service Role Full Access" ON system_logs FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 9. VOICE_INTERACTIONS
ALTER TABLE voice_interactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service Role Full Access" ON voice_interactions;
CREATE POLICY "Service Role Full Access" ON voice_interactions FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 10. KNOWLEDGE_BASE
ALTER TABLE knowledge_base ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service Role Full Access" ON knowledge_base;
CREATE POLICY "Service Role Full Access" ON knowledge_base FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 11. AGENTS
ALTER TABLE agents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service Role Full Access" ON agents;
CREATE POLICY "Service Role Full Access" ON agents FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 12. TOOLS_REGISTRY (If stored in DB)
-- (Assuming tools are JSON in codebase, but if table exists:)
-- ALTER TABLE tools_registry ENABLE ROW LEVEL SECURITY; ...

-- 13. AI_MOUNTED_AGENTS (Drift Monitor)
ALTER TABLE ai_mounted_agents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service Role Full Access" ON ai_mounted_agents;
CREATE POLICY "Service Role Full Access" ON ai_mounted_agents FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 14. AI_KNOWLEDGE_FILES
ALTER TABLE ai_knowledge_files ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service Role Full Access" ON ai_knowledge_files;
CREATE POLICY "Service Role Full Access" ON ai_knowledge_files FOR ALL TO service_role USING (true) WITH CHECK (true);
