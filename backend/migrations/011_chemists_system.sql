-- Chemists/Technical Responsible system
-- Manages authorized signers for COA certificates

-- Create chemists table
CREATE TABLE IF NOT EXISTS chemists (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    name TEXT NOT NULL,
    title TEXT,                          -- "Responsable Técnico"
    credentials TEXT,                    -- "Ing. Bioquímico"
    license_number TEXT,                 -- "Ced. Prof: 8112996"
    license_url TEXT,                    -- Link to official license verification
    signature_url TEXT,                  -- URL to signature image
    email TEXT,
    phone TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    is_default BOOLEAN DEFAULT FALSE,    -- Default signer for new COAs
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create trigger to update updated_at
CREATE OR REPLACE FUNCTION update_chemist_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_chemist_updated_at
    BEFORE UPDATE ON chemists
    FOR EACH ROW
    EXECUTE FUNCTION update_chemist_updated_at();

-- Add chemist_id to coas table if not exists
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'coas' AND column_name = 'chemist_id') THEN
        ALTER TABLE coas ADD COLUMN chemist_id UUID REFERENCES chemists(id) ON DELETE SET NULL;
    END IF;
END $$;

-- Create index on coas.chemist_id
CREATE INDEX IF NOT EXISTS idx_coas_chemist_id ON coas(chemist_id);

-- Insert default chemist (Georgina Ocampo)
INSERT INTO chemists (name, title, credentials, license_number, license_url, signature_url, is_active, is_default)
VALUES (
    'Georgina Ocampo',
    'Responsable Técnico',
    'Ing. Bioquímico',
    '8112996',
    'https://cdn.shopify.com/s/files/1/0710/3361/8604/files/Constancia_ROOA901227MNTMCN04.pdf?v=1761667242',
    'https://cdn.shopify.com/s/files/1/0710/3361/8604/files/FIRMA-GEORGINA-OCAMPO-8112996.png?v=1765805473',
    TRUE,
    TRUE
)
ON CONFLICT DO NOTHING;
