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

print("--- 1. Testing USA Price Points for Annual Sub ---")
r_usa = requests.get(f"https://api.appstoreconnect.apple.com/v1/subscriptions/{ANNUAL_SUB_ID}/pricePoints?filter[territory]=USA&limit=50", headers=HEADERS)
print("USA pricePoints status:", r_usa.status_code)
if r_usa.status_code == 200:
    pts = r_usa.json().get("data", [])
    print(f"Found {len(pts)} price points for USA.")
    target_pt = None
    for p in pts:
        price = p.get("attributes", {}).get("customerPrice")
        if price == "29.99":
            target_pt = p
            break
    if not target_pt and pts:
        target_pt = pts[0]
    
    if target_pt:
        pt_id = target_pt.get("id")
        price = target_pt.get("attributes", {}).get("customerPrice")
        print(f"Selected point: ID={pt_id}, Price={price}")
        
        # Try POST subscriptionPrices
        p_payload = {
            "data": {
                "type": "subscriptionPrices",
                "attributes": {"startDate": None},
                "relationships": {
                    "subscription": {"data": {"type": "subscriptions", "id": ANNUAL_SUB_ID}},
                    "subscriptionPricePoint": {"data": {"type": "subscriptionPricePoints", "id": pt_id}}
                }
            }
        }
        resp = requests.post("https://api.appstoreconnect.apple.com/v1/subscriptionPrices", json=p_payload, headers=HEADERS)
        print("POST subscriptionPrices USA status:", resp.status_code)
        print("Response:", resp.text)

print("\n--- 2. Checking Subscription Availabilities ---")
r_avail = requests.get(f"https://api.appstoreconnect.apple.com/v1/subscriptions/{ANNUAL_SUB_ID}/subscriptionAvailability", headers=HEADERS)
print("subscriptionAvailability status:", r_avail.status_code, r_avail.text)

# Also check app's base territory
r_app = requests.get("https://api.appstoreconnect.apple.com/v1/apps/6817227948?include=priceSchedule", headers=HEADERS)
print("app priceSchedule status:", r_app.status_code)
if r_app.status_code == 200:
    print("App data:", json.dumps(r_app.json(), indent=2)[:500])
