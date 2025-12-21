#!/bin/bash

# Test updating the batch_number in metadata and syncing to Shopify

# 1. First update the COA metadata with the new batch number
echo "=== Step 1: Updating batch_number in metadata ==="
curl -s -X PATCH http://localhost:3000/api/v1/coas/3ac85c02/metadata \
  -H "Content-Type: application/json" \
  -d '{"metadata":{"batch_number":"838387"}}' | python3 -m json.tool

echo ""
echo "=== Step 2: Verify the COA now has batch_number in metadata ==="
SUPABASE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZibnBjb3Nwb2Rod3V6dnhlanVpIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NTI5Nzc0MCwiZXhwIjoyMDgwODczNzQwfQ.-T3JQu4v_0yJT0k8wP1I9pYecxvk-usVZHN00w5MPZc"
curl -s "https://vbnpcospodhwuzvxejui.supabase.co/rest/v1/coas?public_token=eq.3ac85c02&select=batch_id,metadata" \
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
echo "=== Done! Check Shopify metafields for the updated batch ==="
