#!/usr/bin/env python3
import os
import sys
import time
import json
import urllib.request
import urllib.error

try:
    import jwt
    from cryptography.hazmat.primitives import serialization
except ImportError:
    import subprocess
    subprocess.check_call([sys.executable, "-m", "pip", "install", "pyjwt", "cryptography"])
    import jwt
    from cryptography.hazmat.primitives import serialization

KEY_ID = os.environ.get("APP_STORE_CONNECT_KEY_ID")
ISSUER_ID = os.environ.get("APP_STORE_CONNECT_ISSUER_ID")
KEY_CONTENT = os.environ.get("APP_STORE_CONNECT_API_KEY_CONTENT")
TEAM_ID = os.environ.get("APPLE_TEAM_ID")

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
headers = {"kid": KEY_ID, "alg": "ES256", "typ": "JWT"}

token = jwt.encode(payload, formatted_pem, algorithm="ES256", headers=headers)
if isinstance(token, bytes):
    token = token.decode("utf-8")

def api_request(url, data=None, method=None):
    req_headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
        "Accept": "application/json"
    }
    body = json.dumps(data).encode("utf-8") if data else None
    req = urllib.request.Request(url, data=body, headers=req_headers, method=method)
    try:
        with urllib.request.urlopen(req) as resp:
            raw_resp = resp.read().decode("utf-8")
            if not raw_resp.strip():
                return resp.status, {}
            return resp.status, json.loads(raw_resp)
    except urllib.error.HTTPError as e:
        err_body = e.read().decode("utf-8")
        try:
            return e.code, json.loads(err_body)
        except Exception:
            return e.code, {"raw": err_body}
    except Exception as e:
        return 500, {"error": str(e)}

print("\n=== STEP 1: Verify Authentication & Locate Flora AI App ===")
target_bundle_id = "com.flora.ai"
target_app_id = None

status, res = api_request("https://api.appstoreconnect.apple.com/v1/apps?limit=50")
if status != 200:
    print(f"❌ Failed to authenticate with App Store Connect: HTTP {status}", res)
    sys.exit(1)

print("✓ Authenticated with App Store Connect API successfully.")
apps = res.get("data", [])
for a in apps:
    bid = a.get("attributes", {}).get("bundleId")
    name = a.get("attributes", {}).get("name")
    aid = a.get("id")
    print(f"  Found App: '{name}' | Bundle ID: {bid} | ID: {aid}")
    if bid in (target_bundle_id, "com.floraai.plantdoctor", "com.floraai.app"):
        target_app_id = aid
        print(f"  -> Selected target App '{name}' (ID: {aid})")
        break

if not target_app_id:
    # Default to 6817227948 if found in apps
    for a in apps:
        if a.get("id") == "6817227948":
            target_app_id = "6817227948"
            break
    if not target_app_id and len(apps) > 0:
        target_app_id = apps[0].get("id")

print(f"\nUsing Target App ID: {target_app_id}")

print("\n=== STEP 2: Subscription Group Setup ===")
# Check existing subscription groups for the app
status, res = api_request(f"https://api.appstoreconnect.apple.com/v1/apps/{target_app_id}/subscriptionGroups")
existing_groups = res.get("data", []) if status == 200 else []
target_group_id = None

for g in existing_groups:
    ref_name = g.get("attributes", {}).get("referenceName")
    gid = g.get("id")
    print(f"  Existing Group: '{ref_name}' (ID: {gid})")
    target_group_id = gid
    break

if not target_group_id:
    print("Creating new Subscription Group: 'Flora Pro Access'...")
    group_payload = {
        "data": {
            "type": "subscriptionGroups",
            "attributes": {
                "referenceName": "Flora Pro Access"
            },
            "relationships": {
                "app": {
                    "data": {
                        "type": "apps",
                        "id": target_app_id
                    }
                }
            }
        }
    }
    status, res = api_request("https://api.appstoreconnect.apple.com/v1/subscriptionGroups", group_payload)
    if status in (200, 201) and res.get("data"):
        target_group_id = res["data"]["id"]
        print(f"✓ Created Subscription Group: 'Flora Pro Access' (ID: {target_group_id})")
    else:
        print(f"❌ Failed to create Subscription Group (HTTP {status}):", res)
        # Try finding group if already existed
        status_retry, res_retry = api_request(f"https://api.appstoreconnect.apple.com/v1/apps/{target_app_id}/subscriptionGroups")
        if status_retry == 200 and res_retry.get("data") and len(res_retry["data"]) > 0:
            target_group_id = res_retry["data"][0]["id"]
            print(f"✓ Recovered existing Group ID: {target_group_id}")
        else:
            sys.exit(1)

print(f"Active Subscription Group ID: {target_group_id}")

print("\n=== STEP 3: Subscriptions Setup ===")
# Check existing subscriptions in group
status, res = api_request(f"https://api.appstoreconnect.apple.com/v1/subscriptionGroups/{target_group_id}/subscriptions")
existing_subs = res.get("data", []) if status == 200 else []
existing_product_ids = {}

for s in existing_subs:
    pid = s.get("attributes", {}).get("productId")
    sname = s.get("attributes", {}).get("name")
    sid = s.get("id")
    print(f"  Existing Subscription: '{sname}' (ProductID: {pid}, ID: {sid})")
    if pid:
        existing_product_ids[pid] = sid

subscriptions_to_create = [
    {
        "name": "Flora Pro Annual Pass",
        "productId": "flora_annual_2999",
        "period": "ONE_YEAR",
        "groupLevel": 1,
        "priceTarget": 29.99,
        "locName": "Flora Pro Annual",
        "locDesc": "Unlimited plant scans, disease diagnosis, and treatment protocols."
    },
    {
        "name": "Flora Pro Monthly Pass",
        "productId": "flora_monthly_799",
        "period": "ONE_MONTH",
        "groupLevel": 2,
        "priceTarget": 7.99,
        "locName": "Flora Pro Monthly",
        "locDesc": "Flexible monthly access to plant disease scans and treatment protocols."
    }
]

created_sub_ids = {}

for sub_def in subscriptions_to_create:
    pid = sub_def["productId"]
    if pid in existing_product_ids:
        print(f"✓ Product '{pid}' already exists with ID: {existing_product_ids[pid]}")
        created_sub_ids[pid] = existing_product_ids[pid]
        continue

    print(f"\nCreating Subscription: '{sub_def['name']}' (ProductID: {pid}, Period: {sub_def['period']})...")
    sub_payload = {
        "data": {
            "type": "subscriptions",
            "attributes": {
                "name": sub_def["name"],
                "productId": pid,
                "subscriptionPeriod": sub_def["period"],
                "groupLevel": sub_def["groupLevel"]
            },
            "relationships": {
                "group": {
                    "data": {
                        "type": "subscriptionGroups",
                        "id": target_group_id
                    }
                }
            }
        }
    }
    status, res = api_request("https://api.appstoreconnect.apple.com/v1/subscriptions", sub_payload)
    if status in (200, 201) and res.get("data"):
        sid = res["data"]["id"]
        created_sub_ids[pid] = sid
        print(f"✓ Successfully created subscription '{pid}' (ID: {sid})")
    else:
        print(f"❌ Failed to create subscription '{pid}' (HTTP {status}):", res)

print("\n=== STEP 4: Localizations & Pricing Setup ===")
for sub_def in subscriptions_to_create:
    pid = sub_def["productId"]
    sid = created_sub_ids.get(pid)
    if not sid:
        continue

    # 1. Localization
    status, res = api_request(f"https://api.appstoreconnect.apple.com/v1/subscriptions/{sid}/subscriptionLocalizations")
    locs = res.get("data", []) if status == 200 else []
    has_en = any(l.get("attributes", {}).get("locale") == "en-US" for l in locs)
    if not has_en:
        print(f"Adding en-US localization for '{pid}'...")
        loc_payload = {
            "data": {
                "type": "subscriptionLocalizations",
                "attributes": {
                    "locale": "en-US",
                    "name": sub_def["locName"],
                    "description": sub_def["locDesc"]
                },
                "relationships": {
                    "subscription": {
                        "data": {
                            "type": "subscriptions",
                            "id": sid
                        }
                    }
                }
            }
        }
        l_status, l_res = api_request("https://api.appstoreconnect.apple.com/v1/subscriptionLocalizations", loc_payload)
        if l_status in (200, 201):
            print(f"✓ Added localization for '{pid}'")
        else:
            print(f"  Note on localization for '{pid}' (HTTP {l_status}):", l_res)
    else:
        print(f"✓ Localization already present for '{pid}'")

    # 2. Price Points & Prices
    print(f"Checking price points for '{pid}' (Target: ${sub_def['priceTarget']})...")
    status, res = api_request(f"https://api.appstoreconnect.apple.com/v1/subscriptions/{sid}/pricePoints?filter[territory]=USA&limit=50")
    if status == 200 and res.get("data"):
        points = res["data"]
        matching_point_id = None
        for p in points:
            cprice = p.get("attributes", {}).get("customerPrice")
            try:
                if abs(float(cprice) - sub_def["priceTarget"]) < 0.05:
                    matching_point_id = p.get("id")
                    print(f"  Found matching USA price point: ${cprice} (ID: {matching_point_id})")
                    break
            except Exception:
                pass
        
        if matching_point_id:
            price_payload = {
                "data": {
                    "type": "subscriptionPrices",
                    "attributes": {
                        "startDate": None
                    },
                    "relationships": {
                        "subscription": {
                            "data": {"type": "subscriptions", "id": sid}
                        },
                        "subscriptionPricePoint": {
                            "data": {"type": "subscriptionPricePoints", "id": matching_point_id}
                        }
                    }
                }
            }
            p_status, p_res = api_request("https://api.appstoreconnect.apple.com/v1/subscriptionPrices", price_payload)
            if p_status in (200, 201):
                print(f"✓ Configured price ${sub_def['priceTarget']} for '{pid}'")
            else:
                print(f"  Price config response for '{pid}' (HTTP {p_status}):", p_res)
        else:
            print(f"  Could not locate exact ${sub_def['priceTarget']} price point in first 50 points.")
    else:
        print(f"  Price points lookup returned HTTP {status}:", res)

print("\n=== SUMMARY ===")
print("App ID:", target_app_id)
print("Subscription Group ID:", target_group_id)
print("Configured Subscriptions:", created_sub_ids)
print("\nAll done!")
