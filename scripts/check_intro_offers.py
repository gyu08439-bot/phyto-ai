#!/usr/bin/env python3
import os
import requests
import jwt
import time
import json

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

# 1. Check introductory offers
r_intro = requests.get(f"https://api.appstoreconnect.apple.com/v1/subscriptions/{ANNUAL_SUB_ID}/introductoryOffers", headers=HEADERS)
print("introductoryOffers status:", r_intro.status_code)
if r_intro.status_code == 200:
    print("Intro offers data:", json.dumps(r_intro.json(), indent=2))
else:
    print(r_intro.text)

# 2. Check price points and pricing details
r_prices = requests.get(f"https://api.appstoreconnect.apple.com/v1/subscriptions/{ANNUAL_SUB_ID}/prices?include=subscriptionPricePoint", headers=HEADERS)
print("prices status:", r_prices.status_code)
if r_prices.status_code == 200:
    data = r_prices.json()
    print(f"Prices count: {len(data.get('data', []))}")
    for p in data.get('data', [])[:3]:
        print("  Price item:", p.get('id'), p.get('attributes'))
