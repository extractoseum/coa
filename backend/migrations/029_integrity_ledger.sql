-- Migration 029: Integrity Ledger for Immutable Audit Trails
-- This table implements an immutable, cryptographically linked chain of trust for critical system events.

CREATE TABLE IF NOT EXISTS public.integrity_ledger (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type TEXT NOT NULL, -- e.g., 'COA_CREATED', 'COA_STATUS_CHANGED', 'ORDER_STATUS_CHANGED'
    entity_id UUID NOT NULL, -- ID of the related object (e.g. coa_id)
    entity_type TEXT NOT NULL, -- Type of entity (e.g. 'coas', 'orders')
    payload JSONB NOT NULL, -- The original state of the record
    payload_hash TEXT NOT NULL, -- SHA256 of the payload (normalized)
    prev_hash TEXT NOT NULL, -- Link to previous record's hash (forming a chain)
    signature TEXT NOT NULL, -- Ed25519 signature of (payload_hash + prev_hash)
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID REFERENCES public.clients(id) NULL
);

-- Optimization indexes
CREATE INDEX IF NOT EXISTS idx_integrity_ledger_entity ON public.integrity_ledger(entity_id, entity_type);
CREATE INDEX IF NOT EXISTS idx_integrity_ledger_created_at ON public.integrity_ledger(created_at);

-- Initial seed record to start the chain
INSERT INTO public.integrity_ledger (
    event_type, 
    entity_id, 
    entity_type, 
    payload, 
    payload_hash, 
    prev_hash, 
    signature
)
SELECT 'SYSTEM_INIT', '00000000-0000-0000-0000-000000000000', 'system', '{}', '0000000000000000000000000000000000000000000000000000000000000000', 'ROOT', 'ROOT_SIGNATURE'
WHERE NOT EXISTS (SELECT 1 FROM public.integrity_ledger WHERE event_type = 'SYSTEM_INIT');
