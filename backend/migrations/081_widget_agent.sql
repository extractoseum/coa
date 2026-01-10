-- Migration 081: Set Sales Ara as default agent for Widget Chips

-- Update widget_ara chip
UPDATE channel_chips
SET default_agent_id = 'sales_ara'
WHERE channel_id = 'widget_ara';

-- Update widget_shopify chip
UPDATE channel_chips
SET default_agent_id = 'sales_ara'
WHERE channel_id = 'widget_shopify';
