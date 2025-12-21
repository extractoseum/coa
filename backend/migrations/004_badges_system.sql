-- Migration 004: Badges/Insignias System
-- Date: 2025-12-10

-- Tabla de badges globales
CREATE TABLE IF NOT EXISTS badges (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    image_url TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabla relacional: COA <-> Badges (muchos a muchos)
CREATE TABLE IF NOT EXISTS coa_badges (
    id SERIAL PRIMARY KEY,
    coa_id INTEGER REFERENCES coas(id) ON DELETE CASCADE,
    badge_id INTEGER REFERENCES badges(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(coa_id, badge_id)
);

-- Índices para mejorar performance
CREATE INDEX IF NOT EXISTS idx_coa_badges_coa_id ON coa_badges(coa_id);
CREATE INDEX IF NOT EXISTS idx_coa_badges_badge_id ON coa_badges(badge_id);

COMMENT ON TABLE badges IS 'Global badges/insignias library';
COMMENT ON TABLE coa_badges IS 'Many-to-many relationship between COAs and badges';
