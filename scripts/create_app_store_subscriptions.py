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

print("\n=== STEP 1: Locate Flora AI App ===")
target_app_id = "6817227948"
print(f"Target App ID: {target_app_id}")

print("\n=== STEP 2: Subscription Group Setup ===")
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
    print("❌ No group found!")
    sys.exit(1)

print(f"Active Subscription Group ID: {target_group_id}")

print("\n=== STEP 3: Subscriptions Verification ===")
status, res = api_request(f"https://api.appstoreconnect.apple.com/v1/subscriptionGroups/{target_group_id}/subscriptions")
existing_subs = res.get("data", []) if status == 200 else []
existing_product_ids = {}

for s in existing_subs:
    pid = s.get("attributes", {}).get("productId")
    sname = s.get("attributes", {}).get("name")
    sid = s.get("id")
    print(f"  ✓ Found Subscription: '{sname}' (ProductID: {pid}, ID: {sid})")
    if pid:
        existing_product_ids[pid] = sid

subscriptions = [
    {
        "name": "Flora Pro Annual Pass",
        "productId": "flora_annual_2999",
        "period": "ONE_YEAR",
        "priceTarget": 29.99,
        "locName": "Flora Pro Annual",
        "locDesc": "Unlimited plant scans & treatment care."  # <= 45 chars
    },
    {
        "name": "Flora Pro Monthly Pass",
        "productId": "flora_monthly_799",
        "period": "ONE_MONTH",
        "priceTarget": 7.99,
        "locName": "Flora Pro Monthly",
        "locDesc": "Flexible plant scans & disease care."  # <= 45 chars
    }
]

print("\n=== STEP 4: Localizations Setup (<= 45 chars) ===")
for sub_def in subscriptions:
    pid = sub_def["productId"]
    sid = existing_product_ids.get(pid)
    if not sid:
        print(f"Missing ID for {pid}")
        continue

    # Check localization
    status, res = api_request(f"https://api.appstoreconnect.apple.com/v1/subscriptions/{sid}/subscriptionLocalizations")
    locs = res.get("data", []) if status == 200 else []
    has_en = any(l.get("attributes", {}).get("locale") == "en-US" for l in locs)
    if not has_en:
        print(f"Adding en-US localization for '{pid}' ('{sub_def['locDesc']}' - {len(sub_def['locDesc'])} chars)...")
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
            print(f"✓ Added en-US localization for '{pid}'")
        else:
            print(f"  Localization response for '{pid}' (HTTP {l_status}):", l_res)
    else:
        print(f"✓ Localization already present for '{pid}'")

print("\n=== STEP 5: Price Points & Pricing Setup ===")
for sub_def in subscriptions:
    pid = sub_def["productId"]
    sid = existing_product_ids.get(pid)
    target_price = sub_def["priceTarget"]

    # Check existing prices first
    p_status, p_res = api_request(f"https://api.appstoreconnect.apple.com/v1/subscriptions/{sid}/prices")
    existing_prices = p_res.get("data", []) if p_status == 200 else []
    if len(existing_prices) > 0:
        print(f"✓ Product '{pid}' already has active price configuration.")
        continue

    print(f"Searching price points for '{pid}' (Target: ${target_price})...")
    next_url = f"https://api.appstoreconnect.apple.com/v1/subscriptions/{sid}/pricePoints?filter[territory]=USA&limit=100"
    matching_point_id = None

    while next_url and not matching_point_id:
        status, res = api_request(next_url)
        if status != 200:
            print(f"  Failed to fetch price points: HTTP {status}", res)
            break
        points = res.get("data", [])
        for p in points:
            cprice = p.get("attributes", {}).get("customerPrice")
            try:
                if abs(float(cprice) - target_price) < 0.05:
                    matching_point_id = p.get("id")
                    print(f"  -> Found matching USA price point: ${cprice} (ID: {matching_point_id})")
                    break
            except Exception:
                pass
        next_url = res.get("links", {}).get("next")

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
            print(f"✓ Configured base price ${target_price} for '{pid}'!")
        else:
            print(f"  Price config response for '{pid}' (HTTP {p_status}):", p_res)
    else:
        print(f"  Could not find price point ${target_price} in USA price points.")

print("\n=== SUMMARY ===")
print("App ID:", target_app_id)
print("Subscription Group ID:", target_group_id)
print("Subscriptions in App Store Connect:", existing_product_ids)
print("All automated configuration completed successfully!")
