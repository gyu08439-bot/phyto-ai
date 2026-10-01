#!/usr/bin/env python3
import os
import sys
import time
import json
import requests

try:
    import jwt
except ImportError:
    import subprocess
    subprocess.check_call([sys.executable, "-m", "pip", "install", "pyjwt", "cryptography", "requests"])
    import jwt

KEY_ID = os.environ.get("APP_STORE_CONNECT_KEY_ID")
ISSUER_ID = os.environ.get("APP_STORE_CONNECT_ISSUER_ID")
KEY_CONTENT = os.environ.get("APP_STORE_CONNECT_API_KEY_CONTENT")

if not KEY_ID or not ISSUER_ID or not KEY_CONTENT:
    print("❌ Error: Missing App Store Connect API credentials")
    sys.exit(1)

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

HEADERS = {
    "Authorization": f"Bearer {token}",
    "Content-Type": "application/json",
    "Accept": "application/json"
}

ANNUAL_SUB_ID = "6818063327"
MONTHLY_SUB_ID = "6818063612"

for sub_id, name in [(ANNUAL_SUB_ID, "flora_annual_2999"), (MONTHLY_SUB_ID, "flora_monthly_799")]:
    print(f"\n=================== {name} ({sub_id}) ===================")
    r = requests.get(f"https://api.appstoreconnect.apple.com/v1/subscriptions/{sub_id}", headers=HEADERS)
    if r.status_code == 200:
        data = r.json().get("data", {})
        attrs = data.get("attributes", {})
        print(f"Name: {attrs.get('name')}")
        print(f"Product ID: {attrs.get('productId')}")
        print(f"State: {attrs.get('state')}")
        print(f"Subscription Period: {attrs.get('subscriptionPeriod')}")
        print(f"Group: {attrs.get('group')}")
    else:
        print(f"Error getting sub: {r.status_code}", r.text)

    # Check Prices
    p_res = requests.get(f"https://api.appstoreconnect.apple.com/v1/subscriptions/{sub_id}/prices", headers=HEADERS)
    print(f"Prices HTTP {p_res.status_code}:")
    if p_res.status_code == 200:
        prices = p_res.json().get("data", [])
        print(f"Found {len(prices)} price record(s)")
        for p in prices:
            print("  Price record:", p.get("id"), p.get("attributes"))
    else:
        print("  Prices response:", p_res.text)

    # Check Localizations
    l_res = requests.get(f"https://api.appstoreconnect.apple.com/v1/subscriptions/{sub_id}/subscriptionLocalizations", headers=HEADERS)
    if l_res.status_code == 200:
        locs = l_res.json().get("data", [])
        print(f"Localizations: {len(locs)}")
        for l in locs:
            print(f"  {l.get('attributes', {}).get('locale')}: {l.get('attributes', {}).get('name')}")

    # Check Review Screenshot
    s_res = requests.get(f"https://api.appstoreconnect.apple.com/v1/subscriptions/{sub_id}/appStoreReviewScreenshot", headers=HEADERS)
    if s_res.status_code == 200:
        sc = s_res.json().get("data")
        if sc:
            print("  Review Screenshot State:", sc.get("attributes", {}).get("assetDeliveryState", {}).get("state"))
        else:
            print("  No review screenshot")
    else:
        print("  Review screenshot query failed:", s_res.status_code)

# Check In-App Purchases on App level
print("\n=== App Subscriptions / IAP ===")
r_app = requests.get("https://api.appstoreconnect.apple.com/v1/apps/6817227948/inAppPurchasesV2", headers=HEADERS)
print("inAppPurchasesV2 status:", r_app.status_code)
if r_app.status_code == 200:
    for item in r_app.json().get("data", []):
        print("  IAP:", item.get("attributes", {}).get("name"), item.get("attributes", {}).get("productId"), item.get("attributes", {}).get("state"))

