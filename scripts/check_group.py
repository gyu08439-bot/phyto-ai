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

# 1. Check Subscription Groups for the App
r_groups = requests.get("https://api.appstoreconnect.apple.com/v1/apps/6817227948/subscriptionGroups", headers=HEADERS)
print("subscriptionGroups status:", r_groups.status_code)
group_ids = []
if r_groups.status_code == 200:
    for g in r_groups.json().get("data", []):
        gid = g.get("id")
        group_ids.append(gid)
        print("  Group:", gid, g.get("attributes", {}).get("referenceName"))
        # Check subscriptions in this group
        r_subs = requests.get(f"https://api.appstoreconnect.apple.com/v1/subscriptionGroups/{gid}/subscriptions", headers=HEADERS)
        print(f"    Subscriptions in group {gid}:", r_subs.status_code)
        if r_subs.status_code == 200:
            for s in r_subs.json().get("data", []):
                print(f"      Sub: {s.get('id')} - {s.get('attributes', {}).get('productId')} (State: {s.get('attributes', {}).get('state')})")

# 2. Check group relationship of annual sub 6818063327
r_sub_g = requests.get("https://api.appstoreconnect.apple.com/v1/subscriptions/6818063327/group", headers=HEADERS)
print("Annual sub group:", r_sub_g.status_code, r_sub_g.text)

# 3. Check availability endpoint: POST subscriptionAvailabilities
# In ASC API, to make a subscription available, you POST /v1/subscriptionAvailabilities
# Check if availability exists
avail_r = requests.get("https://api.appstoreconnect.apple.com/v1/subscriptions/6818063327?include=subscriptionAvailability", headers=HEADERS)
print("include subscriptionAvailability:", avail_r.status_code)
if avail_r.status_code == 200:
    print(json.dumps(avail_r.json().get("included", []), indent=2))
