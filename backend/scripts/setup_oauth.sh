#!/bin/bash

if [ "$#" -ne 3 ]; then
    echo "Usage: $0 <CLIENT_ID> <CLIENT_SECRET> <REFRESH_TOKEN>"
    exit 1
fi

CLIENT_ID=$1
CLIENT_SECRET=$2
REFRESH_TOKEN=$3

# Check if .env exists
if [ ! -f .env ]; then
    echo ".env file not found globally! Trying in current dir..."
    # Just continue, assuming current dir is correct or we append to new file
fi

if grep -q "ARA_REFRESH_TOKEN" .env; then
     echo "[INFO] ARA_REFRESH_TOKEN found in .env. Updating/Appending anyway or skipping?"
     echo "Skipping append to avoid duplicates."
else
     echo "Appending credentials..."
     echo "" >> .env
     echo "# Gmail OAuth2" >> .env
     echo "ARA_CLIENT_ID=$CLIENT_ID" >> .env
     echo "ARA_CLIENT_SECRET=$CLIENT_SECRET" >> .env
     echo "ARA_REFRESH_TOKEN=$REFRESH_TOKEN" >> .env
     echo "ARA_EMAIL_USER=ara@extractoseum.com" >> .env
     echo "Done."
fi
