-- Migration: Auth System with Shopify Integration
-- Run this SQL in your Supabase SQL Editor

-- 1. Clients Table (users who can log in)
CREATE TABLE IF NOT EXISTS public.clients (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    shopify_customer_id TEXT UNIQUE,
    email TEXT NOT NULL UNIQUE,
    name TEXT,
    phone TEXT,
    company TEXT,
    password_hash TEXT,
    role TEXT DEFAULT 'client' CHECK (role IN ('super_admin', 'client')),
    is_active BOOLEAN DEFAULT TRUE,
    last_login_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_clients_email ON public.clients(email);
CREATE INDEX IF NOT EXISTS idx_clients_shopify_id ON public.clients(shopify_customer_id);

-- 2. Sessions Table (for JWT refresh tokens)
CREATE TABLE IF NOT EXISTS public.sessions (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE,
    refresh_token TEXT UNIQUE NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sessions_client ON public.sessions(client_id);
CREATE INDEX IF NOT EXISTS idx_sessions_token ON public.sessions(refresh_token);

-- 3. Add new columns to COAs table for client assignment and descriptions
ALTER TABLE public.coas ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES public.clients(id);
ALTER TABLE public.coas ADD COLUMN IF NOT EXISTS short_description TEXT;
ALTER TABLE public.coas ADD COLUMN IF NOT EXISTS long_description TEXT;
ALTER TABLE public.coas ADD COLUMN IF NOT EXISTS custom_title TEXT;

-- Index for client's COAs
CREATE INDEX IF NOT EXISTS idx_coas_client ON public.coas(client_id);

-- 4. Create a default super admin user (change password after first login!)
-- Password: admin123 (bcrypt hash)
INSERT INTO public.clients (email, name, role, password_hash)
VALUES (
    'admin@extractoseum.com',
    'Super Admin',
    'super_admin',
    '$2b$10$K.0HwpsoPDGaB/3kQGXyEe1dKr9Q7M1D0c0U5oLV3FMUhM.9.Njni'
) ON CONFLICT (email) DO NOTHING;

-- 5. Enable RLS on clients table
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;

-- 6. RLS Policies (allow service role full access)
-- For clients table
CREATE POLICY "Service role full access to clients" ON public.clients
    FOR ALL USING (true) WITH CHECK (true);

-- For sessions table
CREATE POLICY "Service role full access to sessions" ON public.sessions
    FOR ALL USING (true) WITH CHECK (true);
