-- Add custom_name and coa_number fields to coas table
-- Run this in Supabase SQL Editor

-- 1. Add custom_name column (for custom certificate names)
ALTER TABLE public.coas
ADD COLUMN IF NOT EXISTS custom_name VARCHAR(500);

-- 2. Add coa_number column (for unique COA numbers like EUM_00001_COA)
ALTER TABLE public.coas
ADD COLUMN IF NOT EXISTS coa_number VARCHAR(100) UNIQUE;

-- 3. Create index for faster lookups by coa_number
CREATE INDEX IF NOT EXISTS idx_coas_coa_number ON public.coas(coa_number);

-- 4. Create a function to generate the next COA number
CREATE OR REPLACE FUNCTION generate_coa_number()
RETURNS TEXT AS $$
DECLARE
    next_num INTEGER;
    new_coa_number TEXT;
BEGIN
    -- Get the highest existing COA number
    SELECT COALESCE(
        MAX(
            CAST(
                SUBSTRING(coa_number FROM 'EUM_(\d+)_COA')
                AS INTEGER
            )
        ),
        0
    ) INTO next_num
    FROM public.coas
    WHERE coa_number ~ '^EUM_\d+_COA$';

    -- Increment and format as EUM_XXXXX_COA (5 digits with leading zeros)
    next_num := next_num + 1;
    new_coa_number := 'EUM_' || LPAD(next_num::TEXT, 5, '0') || '_COA';

    RETURN new_coa_number;
END;
$$ LANGUAGE plpgsql;

-- 5. Add trigger to auto-generate COA numbers for new entries (optional)
-- Uncomment if you want automatic COA number generation
/*
CREATE OR REPLACE FUNCTION set_coa_number()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.coa_number IS NULL THEN
        NEW.coa_number := generate_coa_number();
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_set_coa_number
    BEFORE INSERT ON public.coas
    FOR EACH ROW
    EXECUTE FUNCTION set_coa_number();
*/

-- 6. Add comments for documentation
COMMENT ON COLUMN public.coas.custom_name IS 'Custom display name for the certificate (overrides product_sku/batch_id)';
COMMENT ON COLUMN public.coas.coa_number IS 'Unique COA identifier in format EUM_XXXXX_COA';

-- 7. Optionally backfill existing records with COA numbers
-- Uncomment to generate COA numbers for existing records
/*
DO $$
DECLARE
    rec RECORD;
    counter INTEGER := 1;
BEGIN
    FOR rec IN
        SELECT id FROM public.coas
        WHERE coa_number IS NULL
        ORDER BY created_at ASC
    LOOP
        UPDATE public.coas
        SET coa_number = 'EUM_' || LPAD(counter::TEXT, 5, '0') || '_COA'
        WHERE id = rec.id;

        counter := counter + 1;
    END LOOP;
END $$;
*/
