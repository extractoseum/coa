-- =============================================
-- MIGRACIÓN 049 (CORREGIDA): RESTAURAR PREFIJOS USA
-- =============================================

BEGIN;

-- 1. Actualizar Conversations (de 10 dígitos a 11 dígitos USA)
UPDATE conversations
SET contact_handle = '13038159669'
WHERE contact_handle = '3038159669' 
AND channel = 'WA';

-- 2. Actualizar Snapshots
UPDATE crm_contact_snapshots
SET handle = '13038159669'
WHERE handle = '3038159669'
AND channel = 'WA';

-- 3. Si existe la versión 521 (por si acaso), moverla también
UPDATE conversations
SET contact_handle = '13038159669'
WHERE contact_handle = '5213038159669' 
AND channel = 'WA';

UPDATE crm_contact_snapshots
SET handle = '13038159669'
WHERE handle = '5213038159669'
AND channel = 'WA';

COMMIT;
