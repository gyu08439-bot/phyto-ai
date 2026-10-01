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

ANNUAL_SUB_ID = "6818063327"

# 1. Check pricePoints without territory filter
print("Fetching first page of price points without filter...")
r = requests.get(f"https://api.appstoreconnect.apple.com/v1/subscriptions/{ANNUAL_SUB_ID}/pricePoints?limit=10", headers=HEADERS)
print("Status:", r.status_code)
if r.status_code == 200:
    data = r.json()
    items = data.get("data", [])
    print(f"Got {len(items)} price points. Samples:")
    for it in items[:5]:
        attrs = it.get("attributes", {})
        print(" ", it.get("id"), attrs.get("customerPrice"), attrs.get("proceeds"), it.get("relationships", {}).get("territory", {}).get("data", {}).get("id"))
else:
    print("Error:", r.text)

# 2. Check territories
print("\nFetching territories...")
t_res = requests.get("https://api.appstoreconnect.apple.com/v1/territories?limit=10", headers=HEADERS)
print("Territories status:", t_res.status_code)
if t_res.status_code == 200:
    for t in t_res.json().get("data", [])[:5]:
        print("  Territory:", t.get("id"), t.get("attributes", {}).get("currency"))

# 3. Check subscriptionAvailability
print("\nChecking subscription availability...")
a_res = requests.get(f"https://api.appstoreconnect.apple.com/v1/subscriptions/{ANNUAL_SUB_ID}/subscriptionAvailability", headers=HEADERS)
print("Availability status:", a_res.status_code, a_res.text[:200])

