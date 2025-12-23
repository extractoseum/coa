-- Migration: Add missing color column to crm_columns
-- Detected by System Debugger Phase 1

ALTER TABLE crm_columns 
ADD COLUMN IF NOT EXISTS color VARCHAR(20) DEFAULT '#4F46E5';
