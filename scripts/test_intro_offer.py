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

# Test creating 3-day free trial for USA territory
# In App Store Connect, free trial introductory offer:
payload_trial = {
    "data": {
        "type": "subscriptionIntroductoryOffers",
        "attributes": {
            "duration": "THREE_DAYS",
            "numberOfPeriods": 1,
            "offerMode": "FREE_TRIAL",
            "startDate": None
        },
        "relationships": {
            "subscription": {
                "data": {"type": "subscriptions", "id": ANNUAL_SUB_ID}
            },
            "territory": {
                "data": {"type": "territories", "id": "USA"}
            }
        }
    }
}

r = requests.post("https://api.appstoreconnect.apple.com/v1/subscriptionIntroductoryOffers", json=payload_trial, headers=HEADERS)
print("subscriptionIntroductoryOffers POST status:", r.status_code)
print(r.text)
