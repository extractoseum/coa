-- Add geo-location columns to coa_scans table
-- Run this migration in Supabase SQL editor

-- Add new columns for geo location
ALTER TABLE coa_scans
ADD COLUMN IF NOT EXISTS country_name TEXT,
ADD COLUMN IF NOT EXISTS region TEXT,
ADD COLUMN IF NOT EXISTS latitude DECIMAL(10, 8),
ADD COLUMN IF NOT EXISTS longitude DECIMAL(11, 8);

-- Note: country_code and city columns should already exist
-- If they don't exist, uncomment these lines:
-- ALTER TABLE coa_scans ADD COLUMN IF NOT EXISTS country_code VARCHAR(2);
-- ALTER TABLE coa_scans ADD COLUMN IF NOT EXISTS city TEXT;

-- Create index for country_code to improve analytics queries
CREATE INDEX IF NOT EXISTS idx_coa_scans_country_code ON coa_scans(country_code);
CREATE INDEX IF NOT EXISTS idx_coa_scans_city ON coa_scans(city);
