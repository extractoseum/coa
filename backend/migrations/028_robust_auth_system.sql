-- Migration: Robust Authentication (Roles & Step-up)
-- Adds new roles and verification timestamp

-- 1. Add last_verified_at column to clients
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS last_verified_at TIMESTAMP WITH TIME ZONE;

-- 2. Update role constraint
-- First, find and drop the existing check constraint
-- Usually named 'clients_role_check' by default in some systems, but we'll use a safe way
DO $$ 
BEGIN
    ALTER TABLE public.clients DROP CONSTRAINT IF EXISTS clients_role_check;
    ALTER TABLE public.clients DROP CONSTRAINT IF EXISTS check_role;
EXCEPTION
    WHEN undefined_object THEN null;
END $$;

-- 3. Add the expanded role constraint
ALTER TABLE public.clients ADD CONSTRAINT check_role 
CHECK (role IN ('retail', 'club_care', 'b2b', 'dropshipper', 'staff', 'admin', 'super_admin', 'client'));

-- 4. Set initial last_verified_at for existing active clients to avoid immediate step-up lock
UPDATE public.clients SET last_verified_at = NOW() WHERE is_active = true;
