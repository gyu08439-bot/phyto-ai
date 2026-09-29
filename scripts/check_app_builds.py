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

print(f"=== CHECKING BUILDS FOR APP ID {APP_ID} ===")
status, res = api_get(f"https://api.appstoreconnect.apple.com/v1/builds?filter[app]={APP_ID}&limit=10")
print(f"HTTP Status: {status}")
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
