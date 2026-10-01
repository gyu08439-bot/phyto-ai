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

# Check appAvailabilitiesV2
r = requests.get(f"https://api.appstoreconnect.apple.com/v2/appAvailabilities/{APP_ID}", headers=HEADERS)
print("appAvailabilitiesV2 status:", r.status_code)
if r.status_code == 200:
    print("Avail:", r.json())
else:
    # Try v1
    r1 = requests.get(f"https://api.appstoreconnect.apple.com/v1/apps/{APP_ID}/appAvailability", headers=HEADERS)
    print("v1 appAvailability status:", r1.status_code, r1.text[:200])

# Check what territories pricePoints are available for USA vs RUS vs KGZ
for t_code in ["USA", "RUS", "KGZ", "KAZ", "GBR"]:
    r = requests.get(f"https://api.appstoreconnect.apple.com/v1/subscriptions/6818063327/pricePoints?filter[territory]={t_code}&limit=3", headers=HEADERS)
    print(f"filter[territory]={t_code}: HTTP {r.status_code}")
    if r.status_code == 200:
        items = r.json().get("data", [])
        if items:
            p0 = items[0]
            print(f"  sample: {p0.get('attributes', {}).get('customerPrice')}")

