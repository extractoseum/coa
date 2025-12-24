-- =============================================
-- MIGRACIÓN 049: RESTAURAR PREFIJOS USA (Phase 62)
-- =============================================

BEGIN;

-- 1. IDENTIFICAR CONTACTO ESPECÍFICO (CO Denver/USA)
-- Reemplazar el prefijo mexicano incorrecto por el prefijo 1 de USA
UPDATE conversations
SET contact_handle = '13038159669'
WHERE contact_handle = '5213038159669' 
AND channel = 'WA';

UPDATE crm_contact_snapshots
SET handle = '13038159669'
WHERE handle = '5213038159669'
AND channel = 'WA';

-- 2. PATRÓN GENÉRICO (Opcional/Preventivo)
-- Si detectamos otros números que por error tienen 521 pero son claramente USA
-- (Por ejemplo, si empiezan con códigos de área conocidos de USA que no colisionan con MX)
-- De momento, lo haremos manual por seguridad.

COMMIT;
