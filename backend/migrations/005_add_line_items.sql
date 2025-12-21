alter table orders add column if not exists line_items jsonb default '[]'::jsonb;
alter table clients add column if not exists last_order_at timestamptz;
