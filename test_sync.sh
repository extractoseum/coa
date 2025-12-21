#!/bin/bash

# Get token
echo "Getting auth token..."
TOKEN_RESPONSE=$(curl -s -X POST http://localhost:3000/api/v1/auth/shopify/email-login \
  -H "Content-Type: application/json" \
  -d '{"email":"badlt@extractoseum.com"}')

echo "Token response:"
echo "$TOKEN_RESPONSE" | python3 -m json.tool 2>/dev/null || echo "$TOKEN_RESPONSE"

# Extract token
ACCESS_TOKEN=$(echo "$TOKEN_RESPONSE" | python3 -c "import sys, json; print(json.load(sys.stdin).get('accessToken', ''))" 2>/dev/null)

if [ -z "$ACCESS_TOKEN" ]; then
    echo "Could not get access token"
    exit 1
fi

echo ""
echo "Token obtained successfully"
echo ""

# Test sync-all endpoint
echo "=== Syncing all clients to Shopify ==="
curl -s -X POST http://localhost:3000/api/v1/clients/shopify/sync-all \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" | python3 -m json.tool 2>/dev/null || echo "Sync failed"
