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

# 1. Base territory of appPriceSchedule
r = requests.get("https://api.appstoreconnect.apple.com/v1/appPriceSchedules/6817227948/baseTerritory", headers=HEADERS)
print("baseTerritory status:", r.status_code)
if r.status_code == 200:
    print("baseTerritory:", r.json().get("data", {}).get("id"))
else:
    print(r.text)

# 2. Check subscription availability
r = requests.get("https://api.appstoreconnect.apple.com/v1/subscriptionAvailabilities?filter[subscription]=6818063327", headers=HEADERS)
print("subscriptionAvailabilities filter status:", r.status_code, r.text[:200])

r = requests.get("https://api.appstoreconnect.apple.com/v1/subscriptions/6818063327/subscriptionAvailability", headers=HEADERS)
print("subscriptions/availability status:", r.status_code, r.text[:200])

# 3. Check App Availabilities
r = requests.get("https://api.appstoreconnect.apple.com/v1/apps/6817227948/appAvailabilityV2", headers=HEADERS)
print("appAvailabilityV2 status:", r.status_code, r.text[:200])

