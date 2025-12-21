#!/bin/bash
SUPABASE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZibnBjb3Nwb2Rod3V6dnhlanVpIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NTI5Nzc0MCwiZXhwIjoyMDgwODczNzQwfQ.-T3JQu4v_0yJT0k8wP1I9pYecxvk-usVZHN00w5MPZc"
curl -s "https://vbnpcospodhwuzvxejui.supabase.co/rest/v1/coas?public_token=eq.3ac85c02&select=*" \
  -H "apikey: $SUPABASE_KEY" \
  -H "Authorization: Bearer $SUPABASE_KEY"
