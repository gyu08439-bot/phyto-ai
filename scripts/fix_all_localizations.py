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

APP_ID = "6817227948"

print("\n=== STEP 1: Check App Primary Locale ===")
r = requests.get(f"https://api.appstoreconnect.apple.com/v1/apps/{APP_ID}", headers=HEADERS)
primary_locale = "en-US"
if r.status_code == 200:
    app_attrs = r.json().get("data", {}).get("attributes", {})
    primary_locale = app_attrs.get("primaryLocale", "en-US")
    print(f"App Name: {app_attrs.get('name')}")
    print(f"Bundle ID: {app_attrs.get('bundleId')}")
    print(f"Primary Locale: {primary_locale}")
else:
    print(f"Failed to fetch app: {r.status_code}", r.text)

target_locales = list(dict.fromkeys([primary_locale, "en-US", "ru"]))
print(f"Target locales to ensure: {target_locales}")

print("\n=== STEP 2: Find Subscription Groups & Add Localizations ===")
r = requests.get(f"https://api.appstoreconnect.apple.com/v1/apps/{APP_ID}/subscriptionGroups", headers=HEADERS)
if r.status_code != 200:
    print(f"Failed to list subscription groups: {r.status_code}", r.text)
    sys.exit(1)

groups = r.json().get("data", [])
print(f"Found {len(groups)} subscription group(s)")

for g in groups:
    gid = g["id"]
    g_ref_name = g.get("attributes", {}).get("referenceName", "Subscriptions")
    print(f"\n--- Processing Subscription Group: '{g_ref_name}' (ID: {gid}) ---")

    # Fetch existing group localizations
    g_loc_res = requests.get(f"https://api.appstoreconnect.apple.com/v1/subscriptionGroups/{gid}/subscriptionGroupLocalizations", headers=HEADERS)
    existing_g_locs = []
    if g_loc_res.status_code == 200:
        for item in g_loc_res.json().get("data", []):
            loc = item.get("attributes", {}).get("locale")
            existing_g_locs.append(loc)
            print(f"  Existing Group Localization: {loc} -> '{item.get('attributes', {}).get('name')}'")

    for loc in target_locales:
        if loc in existing_g_locs:
            print(f"  ✓ Group localization '{loc}' already exists.")
            continue

        loc_name = "Flora Pro Доступ" if loc.startswith("ru") else "Flora Pro Access"
        print(f"  Creating Subscription Group localization for '{loc}' (name: '{loc_name}')...")
        payload = {
            "data": {
                "type": "subscriptionGroupLocalizations",
                "attributes": {
                    "locale": loc,
                    "name": loc_name
                },
                "relationships": {
                    "subscriptionGroup": {
                        "data": {
                            "type": "subscriptionGroups",
                            "id": gid
                        }
                    }
                }
            }
        }
        cr = requests.post("https://api.appstoreconnect.apple.com/v1/subscriptionGroupLocalizations", json=payload, headers=HEADERS)
        if cr.status_code in (200, 201):
            print(f"  🎉 Created group localization for '{loc}'!")
        else:
            print(f"  ❌ Error creating group localization for '{loc}' ({cr.status_code}):", cr.text)

    # Now process subscriptions in this group
    subs_res = requests.get(f"https://api.appstoreconnect.apple.com/v1/subscriptionGroups/{gid}/subscriptions", headers=HEADERS)
    if subs_res.status_code != 200:
        print(f"  Failed to get subscriptions for group {gid}: {subs_res.status_code}", subs_res.text)
        continue

    subs = subs_res.json().get("data", [])
    print(f"  Group {gid} has {len(subs)} subscription(s)")

    for sub in subs:
        sub_id = sub["id"]
        pid = sub.get("attributes", {}).get("productId", "")
        sub_name = sub.get("attributes", {}).get("name", "")
        print(f"\n  Checking Subscription: '{sub_name}' ({pid}, ID: {sub_id})")

        # Fetch existing localizations for this sub
        sub_loc_res = requests.get(f"https://api.appstoreconnect.apple.com/v1/subscriptions/{sub_id}/subscriptionLocalizations", headers=HEADERS)
        existing_sub_locs = []
        if sub_loc_res.status_code == 200:
            for item in sub_loc_res.json().get("data", []):
                loc = item.get("attributes", {}).get("locale")
                existing_sub_locs.append(loc)
                print(f"    Existing Sub Localization: {loc} -> '{item.get('attributes', {}).get('name')}' ('{item.get('attributes', {}).get('description')}')")

        # Localized content definitions (descriptions strictly <= 45 chars)
        is_annual = "annual" in pid.lower() or "year" in pid.lower() or "2999" in pid.lower()
        if is_annual:
            data_map = {
                "en": ("Flora Pro Annual", "Unlimited plant scans & treatment care."),
                "ru": ("Flora Pro Годовая", "Безлимитный уход и лечение растений.")
            }
        else:
            data_map = {
                "en": ("Flora Pro Monthly", "Flexible plant scans & disease care."),
                "ru": ("Flora Pro Месячная", "Диагностика и план ухода на месяц.")
            }

        for loc in target_locales:
            if loc in existing_sub_locs:
                print(f"    ✓ Sub localization '{loc}' already exists.")
                continue

            lang_key = "ru" if loc.startswith("ru") else "en"
            disp_name, disp_desc = data_map[lang_key]

            print(f"    Creating sub localization for '{loc}' ('{disp_name}' - '{disp_desc}')...")
            sub_payload = {
                "data": {
                    "type": "subscriptionLocalizations",
                    "attributes": {
                        "locale": loc,
                        "name": disp_name,
                        "description": disp_desc
                    },
                    "relationships": {
                        "subscription": {
                            "data": {
                                "type": "subscriptions",
                                "id": sub_id
                            }
                        }
                    }
                }
            }
            sub_cr = requests.post("https://api.appstoreconnect.apple.com/v1/subscriptionLocalizations", json=sub_payload, headers=HEADERS)
            if sub_cr.status_code in (200, 201):
                print(f"    🎉 Created sub localization for '{loc}'!")
            else:
                print(f"    ❌ Error creating sub localization for '{loc}' ({sub_cr.status_code}):", sub_cr.text)

print("\n=== STEP 3: Verify Review Screenshots Delivery State ===")
for sub_id, pid in [("6818063327", "flora_annual_2999"), ("6818063612", "flora_monthly_799")]:
    r = requests.get(f"https://api.appstoreconnect.apple.com/v1/subscriptions/{sub_id}/appStoreReviewScreenshot", headers=HEADERS)
    if r.status_code == 200 and r.json().get("data"):
        state = r.json()["data"]["attributes"].get("assetDeliveryState", {}).get("state")
        print(f"✓ Subscription {pid} review screenshot delivery state: {state}")
    else:
        print(f"⚠️ Subscription {pid} review screenshot status: {r.status_code}")

print("\n=== ALL LOCALIZATION TASKS COMPLETE ===")
