#!/usr/bin/env python3
import os
import sys
import time
import json
import requests
import jwt

KEY_ID = os.environ.get("APP_STORE_CONNECT_KEY_ID")
ISSUER_ID = os.environ.get("APP_STORE_CONNECT_ISSUER_ID")
KEY_CONTENT = os.environ.get("APP_STORE_CONNECT_API_KEY_CONTENT")

raw_key = KEY_CONTENT.strip()
if not raw_key.startswith("-----BEGIN"):
    formatted_pem = "-----BEGIN PRIVATE KEY-----\n" + raw_key + "\n-----END PRIVATE KEY-----"
else:
    formatted_pem = raw_key.replace("\\n", "\n")

now = int(time.time())
payload = {"iss": ISSUER_ID, "iat": now, "exp": now + 1200, "aud": "appstoreconnect-v1"}
headers_jwt = {"kid": KEY_ID, "alg": "ES256", "typ": "JWT"}
token = jwt.encode(payload, formatted_pem, algorithm="ES256", headers=headers_jwt)
if isinstance(token, bytes):
    token = token.decode("utf-8")

HEADERS = {"Authorization": f"Bearer {token}", "Content-Type": "application/json", "Accept": "application/json"}

APP_ID = "6817227948"

# 1. Check availableTerritories
print("Checking availableTerritories...")
r = requests.get(f"https://api.appstoreconnect.apple.com/v1/apps/{APP_ID}/availableTerritories?limit=10", headers=HEADERS)
print("availableTerritories status:", r.status_code)
if r.status_code == 200:
    items = r.json().get("data", [])
    print(f"Available territories count: {len(items)}")
    for it in items:
        print(" ", it.get("id"), it.get("attributes", {}).get("currency"))
else:
    print(r.text)

# 2. Check appPriceSchedules
print("\nChecking appPriceSchedule...")
r = requests.get(f"https://api.appstoreconnect.apple.com/v1/apps/{APP_ID}/appPriceSchedule", headers=HEADERS)
print("appPriceSchedule status:", r.status_code)
if r.status_code == 200:
    print(r.json())
else:
    print(r.text)

# 3. Check subscriptionAvailability for group or sub
print("\nChecking subscription groups...")
r = requests.get(f"https://api.appstoreconnect.apple.com/v1/apps/{APP_ID}/subscriptionGroups", headers=HEADERS)
if r.status_code == 200:
    groups = r.json().get("data", [])
    for g in groups:
        gid = g["id"]
        # Check subscriptionGroupRelationships
        print("Group:", gid)

