-- Check if the table is in the realtime publication
SELECT schemaname, tablename 
FROM pg_publication_tables 
WHERE pubname = 'supabase_realtime' 
  AND tablename = 'crm_messages';

-- Check RLS enablement
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE tablename = 'crm_messages';

-- Check RLS policies
SELECT schemaname, tablename, policyname, roles, cmd, qual, with_check 
FROM pg_policies 
WHERE tablename = 'crm_messages';
