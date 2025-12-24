-- =============================================
-- MIGRATION: NORMALIZE EXISTING HANDLES (PHASE 60)
-- Description: Updates existing format raw handles (13 digits) to 10 digits.
-- =============================================

-- 1. Update conversations table
-- Extract last 10 characters if it's a numeric handle of length > 10 for WA
UPDATE conversations
SET contact_handle = right(contact_handle, 10)
WHERE channel = 'WA' 
AND length(contact_handle) > 10 
AND contact_handle ~ '^[0-9]+$';

-- 2. Update snapshots table
UPDATE crm_contact_snapshots
SET handle = right(handle, 10)
WHERE channel = 'WA' 
AND length(handle) > 10 
AND handle ~ '^[0-9]+$';
