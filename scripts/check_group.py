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

PRIVACY_URL = "https://c75f0fd6.flora-ai-6e5.pages.dev/privacy.html"

# 1. Update Privacy Policy URL in App Info Localizations
print("--- 1. Setting Privacy Policy URL ---")
r_app_info = requests.get("https://api.appstoreconnect.apple.com/v1/apps/6817227948/appInfos", headers=HEADERS)
if r_app_info.status_code == 200:
    for ai in r_app_info.json().get("data", []):
        ai_id = ai.get("id")
        r_locs = requests.get(f"https://api.appstoreconnect.apple.com/v1/appInfos/{ai_id}/appInfoLocalizations", headers=HEADERS)
        if r_locs.status_code == 200:
            for loc in r_locs.json().get("data", []):
                loc_id = loc.get("id")
                locale = loc.get("attributes", {}).get("locale")
                patch_payload = {
                    "data": {
                        "type": "appInfoLocalizations",
                        "id": loc_id,
                        "attributes": {
                            "privacyPolicyUrl": PRIVACY_URL
                        }
                    }
                }
                patch_r = requests.patch(f"https://api.appstoreconnect.apple.com/v1/appInfoLocalizations/{loc_id}", json=patch_payload, headers=HEADERS)
                print(f"  Patched appInfoLocalization {locale} ({loc_id}): HTTP {patch_r.status_code}")

# 2. Get all territories
print("\n--- 2. Fetching Territories ---")
t_list = []
url = "https://api.appstoreconnect.apple.com/v1/territories?limit=200"
while url:
    r_t = requests.get(url, headers=HEADERS)
    if r_t.status_code == 200:
        td = r_t.json()
        t_list.extend([{"type": "territories", "id": x["id"]} for x in td.get("data", [])])
        url = td.get("links", {}).get("next")
    else:
        break
print(f"Total territories: {len(t_list)}")

# 3. Create Subscription Availability for both subscriptions
print("\n--- 3. Creating Subscription Availabilities ---")
for sid in ["6818063327", "6818063612"]:
    avail_payload = {
        "data": {
            "type": "subscriptionAvailabilities",
            "attributes": {
                "availableInNewTerritories": True
            },
            "relationships": {
                "subscription": {
                    "data": {"type": "subscriptions", "id": sid}
                },
                "availableTerritories": {
                    "data": t_list
                }
            }
        }
    }
    r_av = requests.post("https://api.appstoreconnect.apple.com/v1/subscriptionAvailabilities", json=avail_payload, headers=HEADERS)
    print(f"POST subscriptionAvailabilities for {sid}: HTTP {r_av.status_code}")
    if r_av.status_code != 201:
        print("  Error:", r_av.text[:300])

# 4. Check state of subscriptions now
print("\n--- 4. Checking New Subscription States ---")
for name, sid in [("flora_annual_2999", "6818063327"), ("flora_monthly_799", "6818063612")]:
    sub_r = requests.get(f"https://api.appstoreconnect.apple.com/v1/subscriptions/{sid}", headers=HEADERS)
    if sub_r.status_code == 200:
        s_data = sub_r.json()
        attrs = s_data.get("data", {}).get("attributes", {})
        print(f"Subscription {name}: State = {attrs.get('state')}")
