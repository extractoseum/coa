-- Migration: Browsing Behavior Tracking
-- Created: 2025-12-21
-- Description: Table to store granular behavioral events (product views, searches, etc.)

CREATE TABLE IF NOT EXISTS browsing_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL CHECK (event_type IN ('view_product', 'search_view', 'collection_view', 'add_to_cart')),
    handle TEXT, -- Email or Phone to resolve client if not immediately identifiable
    metadata JSONB DEFAULT '{}'::jsonb, -- { product_name, product_id, sku, search_query, etc. }
    session_id TEXT, -- To group events in a single visit
    url TEXT, -- Source URL
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexing for lookup speed
CREATE INDEX IF NOT EXISTS idx_browsing_events_client ON browsing_events(client_id);
CREATE INDEX IF NOT EXISTS idx_browsing_events_handle ON browsing_events(handle);
CREATE INDEX IF NOT EXISTS idx_browsing_events_type ON browsing_events(event_type);
CREATE INDEX IF NOT EXISTS idx_browsing_events_created ON browsing_events(created_at);
