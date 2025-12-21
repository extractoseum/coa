#!/bin/bash

# Test updating custom_name and coa_number in COA and syncing to Shopify

SUPABASE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZibnBjb3Nwb2Rod3V6dnhlanVpIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NTI5Nzc0MCwiZXhwIjoyMDgwODczNzQwfQ.-T3JQu4v_0yJT0k8wP1I9pYecxvk-usVZHN00w5MPZc"

echo "=== Step 1: Updating custom_name and coa_number in database ==="
curl -s -X PATCH "https://vbnpcospodhwuzvxejui.supabase.co/rest/v1/coas?public_token=eq.3ac85c02" \
  -H "apikey: $SUPABASE_KEY" \
  -H "Authorization: Bearer $SUPABASE_KEY" \
  -H "Content-Type: application/json" \
  -H "Prefer: return=representation" \
  -d '{"custom_name":"Extracto RSO","coa_number":"EUM_11DE8480_COA"}' | python3 -m json.tool

echo ""
echo "=== Step 2: Verify the COA now has custom_name and coa_number ==="
curl -s "https://vbnpcospodhwuzvxejui.supabase.co/rest/v1/coas?public_token=eq.3ac85c02&select=public_token,custom_name,coa_number,batch_id,metadata" \
  -H "apikey: $SUPABASE_KEY" \
  -H "Authorization: Bearer $SUPABASE_KEY" | python3 -m json.tool

echo ""
echo "=== Step 3: Getting auth token ==="
TOKEN_RESPONSE=$(curl -s -X POST http://localhost:3000/api/v1/auth/shopify/email-login \
  -H "Content-Type: application/json" \
  -d '{"email":"badlt@extractoseum.com"}')

ACCESS_TOKEN=$(echo "$TOKEN_RESPONSE" | python3 -c "import sys, json; print(json.load(sys.stdin).get('accessToken', ''))" 2>/dev/null)
echo "Token obtained: ${ACCESS_TOKEN:0:20}..."

echo ""
echo "=== Step 4: Syncing to Shopify ==="
curl -s -X POST http://localhost:3000/api/v1/clients/shopify/sync-all \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" | python3 -m json.tool

echo ""
echo "=== Done! Check Shopify metafields for: Nombre (custom_name) and COA Number ==="
