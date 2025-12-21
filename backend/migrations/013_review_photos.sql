-- =====================================================
-- Migration: Review Photos
-- Date: 2025-12-17
-- Description: Add photo support to COA reviews
-- =====================================================

-- Add photo_url column to coa_reviews table
ALTER TABLE coa_reviews ADD COLUMN IF NOT EXISTS photo_url TEXT;

COMMENT ON COLUMN coa_reviews.photo_url IS 'URL of photo uploaded with the review';
