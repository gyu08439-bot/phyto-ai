#!/usr/bin/env python3
import os
import requests
import jwt
import time

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

# Test subscriptionSubmissions
r = requests.post("https://api.appstoreconnect.apple.com/v1/subscriptionSubmissions", json={
    "data": {
        "type": "subscriptionSubmissions",
        "relationships": {
            "subscription": {"data": {"type": "subscriptions", "id": "6818063327"}}
        }
    }
}, headers=HEADERS)
print("subscriptionSubmissions POST status:", r.status_code)
print(r.text)

# Also check app store version in-app purchase relationships
r2 = requests.get("https://api.appstoreconnect.apple.com/v1/apps/6817227948/appStoreVersions?filter[appStoreState]=PREPARE_FOR_SUBMISSION", headers=HEADERS)
print("appStoreVersions status:", r2.status_code)
if r2.status_code == 200:
    for v in r2.json().get("data", []):
        vid = v.get("id")
        print("Version:", vid, v.get("attributes", {}).get("versionString"))
