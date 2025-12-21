-- Fix COAs with missing analysis_date by using their created_at timestamp
-- Run this in Supabase SQL Editor

-- Update all COAs where analysis_date is NULL
-- Set analysis_date to created_at (the date when the COA was uploaded)
UPDATE public.coas
SET analysis_date = created_at
WHERE analysis_date IS NULL;

-- Verify the changes
-- Uncomment to see which records were updated
/*
SELECT
    public_token,
    batch_id,
    analysis_date,
    created_at,
    lab_name
FROM public.coas
ORDER BY created_at DESC
LIMIT 10;
*/
