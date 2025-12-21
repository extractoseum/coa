
-- Allow email to be NULL for phone-only users
ALTER TABLE clients ALTER COLUMN email DROP NOT NULL;
