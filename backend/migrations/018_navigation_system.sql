-- Create navigation_items table
CREATE TABLE IF NOT EXISTS navigation_items (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    label TEXT NOT NULL,
    icon TEXT NOT NULL, -- Lucide icon name
    href TEXT, -- URL or path
    type TEXT NOT NULL CHECK (type IN ('main', 'user', 'admin')), -- Menu section
    parent_id UUID REFERENCES navigation_items(id) ON DELETE CASCADE, -- For submenus
    order_index INTEGER DEFAULT 0,
    is_external BOOLEAN DEFAULT false,
    is_auth_only BOOLEAN DEFAULT false,
    is_admin_only BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_navigation_items_type ON navigation_items(type);
CREATE INDEX IF NOT EXISTS idx_navigation_items_parent_id ON navigation_items(parent_id);
CREATE INDEX IF NOT EXISTS idx_navigation_items_order_index ON navigation_items(order_index);

-- Trigger for updating updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_navigation_items_updated_at
    BEFORE UPDATE ON navigation_items
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Seed initial data (based on current Navbar.tsx)

-- Main Menu
INSERT INTO navigation_items (label, icon, href, type, order_index, is_external) VALUES
('Shop', 'ShoppingBag', 'https://extractoseum.com/collections/candy-kush', 'main', 0, true),
('Contacto', 'MessageCircle', 'https://wa.me/message/NJEJOGWKULIQH1', 'main', 1, true),
('Mis COA', 'FileText', 'https://extractoseum.com/pages/coa', 'main', 2, true);

-- User Menu
INSERT INTO navigation_items (label, icon, href, type, order_index, is_auth_only) VALUES
('Dashboard', 'LayoutDashboard', '/dashboard', 'user', 0, true),
('Mis Carpetas', 'FolderOpen', '/folders', 'user', 1, true);

-- Admin Menu
INSERT INTO navigation_items (label, icon, href, type, order_index, is_admin_only) VALUES
('Administrar COAs', 'FileText', '/admin/coas', 'admin', 0, true),
('Subir COA', 'Upload', '/upload', 'admin', 1, true),
('Inventario', 'Box', '/inventory', 'admin', 2, true),
('Badges', 'Award', '/badges', 'admin', 3, true),
('Banners', 'Image', '/banners', 'admin', 4, true),
('Templates', 'FileCode', '/templates', 'admin', 5, true),
('Quimicos', 'User', '/chemists', 'admin', 6, true),
('Configuracion', 'Settings', '/settings', 'admin', 7, true);
