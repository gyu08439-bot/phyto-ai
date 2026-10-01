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

# 1. Available territories for app
print("Querying app relationships...")
r = requests.get("https://api.appstoreconnect.apple.com/v1/apps/6817227948?include=availableTerritories,prices", headers=HEADERS)
print("Status:", r.status_code)
if r.status_code == 200:
    data = r.json()
    included = data.get("included", [])
    print(f"Included items: {len(included)}")
    for inc in included:
        print("  Type:", inc.get("type"), inc.get("id"), inc.get("attributes"))

# 2. Try RUS and KGZ price points for annual sub
for t in ["KGZ", "RUS", "KAZ"]:
    print(f"\nSearching price point for territory {t}...")
    r_pts = requests.get(f"https://api.appstoreconnect.apple.com/v1/subscriptions/6818063327/pricePoints?filter[territory]={t}&limit=100", headers=HEADERS)
    if r_pts.status_code == 200:
        pts = r_pts.json().get("data", [])
        print(f"  Got {len(pts)} points for {t}. Testing price creation with first point...")
        if pts:
            sample_pt = pts[0]
            pt_id = sample_pt.get("id")
            pt_price = sample_pt.get("attributes", {}).get("customerPrice")
            print(f"  Testing {pt_price} (ID: {pt_id})...")
            p_payload = {
                "data": {
                    "type": "subscriptionPrices",
                    "attributes": {"startDate": None},
                    "relationships": {
                        "subscription": {"data": {"type": "subscriptions", "id": "6818063327"}},
                        "subscriptionPricePoint": {"data": {"type": "subscriptionPricePoints", "id": pt_id}}
                    }
                }
            }
            p_res = requests.post("https://api.appstoreconnect.apple.com/v1/subscriptionPrices", json=p_payload, headers=HEADERS)
            print(f"  POST subscriptionPrices with {t} point: HTTP {p_res.status_code}")
            print("  Response:", p_res.text[:300])

