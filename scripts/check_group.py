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

# Add review note to subscription 6818063327 and 6818063612
for sid in ["6818063327", "6818063612"]:
    patch_payload = {
        "data": {
            "type": "subscriptions",
            "id": sid,
            "attributes": {
                "reviewNote": "Annual and monthly subscriptions unlock full clinical plant pathology and unlimited plant diagnosis."
            }
        }
    }
    r = requests.patch(f"https://api.appstoreconnect.apple.com/v1/subscriptions/{sid}", json=patch_payload, headers=HEADERS)
    print(f"Patch reviewNote on {sid}: HTTP {r.status_code}")

# Check subscription details
r = requests.get("https://api.appstoreconnect.apple.com/v1/subscriptions/6818063327?include=subscriptionLocalizations,appStoreReviewScreenshot,prices", headers=HEADERS)
if r.status_code == 200:
    data = r.json()
    print("Annual Sub attrs:", json.dumps(data.get("data", {}).get("attributes"), indent=2))
    print("Included types:", [x.get("type") for x in data.get("included", [])])
