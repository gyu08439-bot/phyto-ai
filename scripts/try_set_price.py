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
MONTHLY_SUB_ID = "6818063612"

# 1. Set USA Price Point for Monthly Sub ($7.99)
print("--- 1. Setting USA Price Point for Monthly Sub ($7.99) ---")
r_m = requests.get(f"https://api.appstoreconnect.apple.com/v1/subscriptions/{MONTHLY_SUB_ID}/pricePoints?filter[territory]=USA&limit=50", headers=HEADERS)
print("Monthly pricePoints status:", r_m.status_code)
if r_m.status_code == 200:
    pts = r_m.json().get("data", [])
    target_pt = None
    for p in pts:
        price = p.get("attributes", {}).get("customerPrice")
        if price == "7.99":
            target_pt = p
            break
    if not target_pt and pts:
        target_pt = pts[0]
    
    if target_pt:
        pt_id = target_pt.get("id")
        price = target_pt.get("attributes", {}).get("customerPrice")
        print(f"Selected monthly point: ID={pt_id}, Price={price}")
        p_payload = {
            "data": {
                "type": "subscriptionPrices",
                "attributes": {"startDate": None},
                "relationships": {
                    "subscription": {"data": {"type": "subscriptions", "id": MONTHLY_SUB_ID}},
                    "subscriptionPricePoint": {"data": {"type": "subscriptionPricePoints", "id": pt_id}}
                }
            }
        }
        resp = requests.post("https://api.appstoreconnect.apple.com/v1/subscriptionPrices", json=p_payload, headers=HEADERS)
        print("POST monthly price status:", resp.status_code)
        print("Response:", resp.text[:300])

# 2. Check updated status and prices of both subscriptions
print("\n--- 2. Verifying Subscriptions Status & Prices ---")
for name, sid in [("flora_annual_2999", ANNUAL_SUB_ID), ("flora_monthly_799", MONTHLY_SUB_ID)]:
    sub_r = requests.get(f"https://api.appstoreconnect.apple.com/v1/subscriptions/{sid}?include=prices", headers=HEADERS)
    print(f"\nSubscription {name} ({sid}): HTTP {sub_r.status_code}")
    if sub_r.status_code == 200:
        s_data = sub_r.json()
        attrs = s_data.get("data", {}).get("attributes", {})
        print(f"  Name: {attrs.get('name')}")
        print(f"  State: {attrs.get('state')}")
        print(f"  Review Note: {attrs.get('reviewNote')}")
        inc = s_data.get("included", [])
        print(f"  Prices count in included: {len(inc)}")
        for item in inc:
            print(f"    Price item: {item.get('id')}, type: {item.get('type')}")
