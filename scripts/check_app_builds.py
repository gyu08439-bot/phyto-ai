#!/usr/bin/env python3
import os
import sys
import time
import json
import urllib.request
import urllib.error

try:
    import jwt
except ImportError:
    import subprocess
    subprocess.check_call([sys.executable, "-m", "pip", "install", "pyjwt", "cryptography"])
    import jwt

KEY_ID = os.environ.get("APP_STORE_CONNECT_KEY_ID")
ISSUER_ID = os.environ.get("APP_STORE_CONNECT_ISSUER_ID")
KEY_CONTENT = os.environ.get("APP_STORE_CONNECT_API_KEY_CONTENT")
APP_ID = "6817227948"

if not KEY_ID or not ISSUER_ID or not KEY_CONTENT:
    print("Error: Missing App Store Connect API credentials")
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

def api_get(url):
    req = urllib.request.Request(url, headers={
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
        "Accept": "application/json"
    })
    try:
        with urllib.request.urlopen(req) as resp:
            return resp.status, json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read().decode("utf-8"))
    except Exception as e:
        return 500, {"error": str(e)}

def api_post(url, data):
    body = json.dumps(data).encode("utf-8")
    req = urllib.request.Request(url, data=body, headers={
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
        "Accept": "application/json"
    }, method="POST")
    try:
        with urllib.request.urlopen(req) as resp:
            content = resp.read().decode("utf-8")
            return resp.status, json.loads(content) if content else {}
    except urllib.error.HTTPError as e:
        content = e.read().decode("utf-8")
        return e.code, json.loads(content) if content else {"error": str(e)}
    except Exception as e:
        return 500, {"error": str(e)}

print(f"=== CHECKING BUILDS FOR APP ID {APP_ID} ===")
status, res = api_get(f"https://api.appstoreconnect.apple.com/v1/builds?filter[app]={APP_ID}&limit=10")
print(f"HTTP Status: {status}")
valid_builds = []
if status == 200:
    data = res.get("data", [])
    print(f"Total builds found: {len(data)}")
    for b in data:
        bid = b.get("id")
        attr = b.get("attributes", {})
        version = attr.get("version")
        state = attr.get("processingState")
        uploaded = attr.get("uploadedDate")
        print(f"  - Build: ID={bid}, Version/Build={version}, State={state}, Uploaded={uploaded}")
        if state == "VALID":
            valid_builds.append(b)
else:
    print("Error querying builds:", res)

print("\n=== CHECKING PRERELEASE VERSIONS ===")
status, res = api_get(f"https://api.appstoreconnect.apple.com/v1/apps/{APP_ID}/preReleaseVersions")
if status == 200:
    for prv in res.get("data", []):
        pattr = prv.get("attributes", {})
        print(f"  - PreRelease Version: {pattr.get('version')}, Platform: {pattr.get('platform')}")
else:
    print("Error querying preReleaseVersions:", res)

print("\n=== CHECKING & LINKING BETA GROUPS ===")
status, res = api_get(f"https://api.appstoreconnect.apple.com/v1/apps/{APP_ID}/betaGroups")
if status == 200:
    for bg in res.get("data", []):
        bg_id = bg.get("id")
        pattr = bg.get("attributes", {})
        group_name = pattr.get('name')
        print(f"  - Beta Group: ID={bg_id}, Name='{group_name}', isInternalGroup={pattr.get('isInternalGroup')}")

        # Check builds already linked to this beta group
        b_status, b_res = api_get(f"https://api.appstoreconnect.apple.com/v1/betaGroups/{bg_id}/builds")
        linked_build_ids = set()
        if b_status == 200:
            for lb in b_res.get("data", []):
                linked_build_ids.add(lb.get("id"))
                print(f"    - Already Linked Build: ID={lb.get('id')}, Version={lb.get('attributes', {}).get('version')}")

        # Link all valid builds to this beta group so testers can immediately install
        for b in valid_builds:
            b_id = b.get("id")
            b_version = b.get("attributes", {}).get("version")
            if b_id not in linked_build_ids:
                print(f"  --> Linking valid build {b_version} (ID: {b_id}) to Beta Group '{group_name}'...")
                link_payload = {
                    "data": [
                        {"type": "builds", "id": b_id}
                    ]
                }
                l_status, l_res = api_post(f"https://api.appstoreconnect.apple.com/v1/betaGroups/{bg_id}/relationships/builds", link_payload)
                print(f"  --> Result: HTTP {l_status} {l_res}")
else:
    print("Error querying betaGroups:", res)
