import os
import sys
import time
import json
import urllib.request
import urllib.error

# Generate JWT for App Store Connect API
try:
    import jwt
except ImportError:
    import subprocess
    subprocess.check_call([sys.executable, "-m", "pip", "install", "pyjwt", "cryptography"])
    import jwt

KEY_ID = os.environ.get("APP_STORE_CONNECT_KEY_ID")
ISSUER_ID = os.environ.get("APP_STORE_CONNECT_ISSUER_ID")
KEY_CONTENT = os.environ.get("APP_STORE_CONNECT_API_KEY_CONTENT")
BUNDLE_ID = os.environ.get("BUNDLE_ID", "com.floraai.app")
APP_NAME = os.environ.get("APP_NAME", "Flora AI: Plant Doctor")

if not KEY_ID or not ISSUER_ID or not KEY_CONTENT:
    print("Error: Missing App Store Connect API credentials")
    sys.exit(1)

# Format private key
private_key = KEY_CONTENT.strip()

now = int(time.time())
payload = {
    "iss": ISSUER_ID,
    "iat": now,
    "exp": now + 1200,
    "aud": "appstoreconnect-v1"
}

headers = {
    "kid": KEY_ID,
    "alg": "ES256",
    "typ": "JWT"
}

token = jwt.encode(payload, private_key, algorithm="ES256", headers=headers)
if isinstance(token, bytes):
    token = token.decode("utf-8")

def api_request(url, data=None):
    req_headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    }
    body = json.dumps(data).encode("utf-8") if data else None
    req = urllib.request.Request(url, data=body, headers=req_headers)
    try:
        with urllib.request.urlopen(req) as resp:
            return resp.status, json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        err_body = e.read().decode("utf-8")
        try:
            return e.code, json.loads(err_body)
        except:
            return e.code, {"raw": err_body}

print(f"Checking Bundle ID: {BUNDLE_ID}...")
status, res = api_request(f"https://api.appstoreconnect.apple.com/v1/bundleIds?filter[identifier]={BUNDLE_ID}")
bundle_obj_id = None

if status == 200 and res.get("data"):
    bundle_obj_id = res["data"][0]["id"]
    print(f"✓ Bundle ID already registered: {bundle_obj_id}")
else:
    print(f"Registering Bundle ID: {BUNDLE_ID}...")
    create_payload = {
        "data": {
            "type": "bundleIds",
            "attributes": {
                "identifier": BUNDLE_ID,
                "name": "Flora AI",
                "platform": "IOS"
            }
        }
    }
    status, res = api_request("https://api.appstoreconnect.apple.com/v1/bundleIds", create_payload)
    if status in (200, 201):
        bundle_obj_id = res["data"]["id"]
        print(f"✓ Successfully registered Bundle ID: {bundle_obj_id}")
    else:
        print(f"Bundle ID registration response ({status}): {res}")

print(f"Checking App Store Connect App: {APP_NAME}...")
status, res = api_request(f"https://api.appstoreconnect.apple.com/v1/apps?filter[bundleId]={BUNDLE_ID}")
if status == 200 and res.get("data"):
    print(f"✓ App already exists in App Store Connect: {res['data'][0]['attributes']['name']}")
else:
    if bundle_obj_id:
        print(f"Creating App Store record for {APP_NAME}...")
        app_payload = {
            "data": {
                "type": "apps",
                "attributes": {
                    "name": APP_NAME,
                    "bundleId": BUNDLE_ID,
                    "sku": "flora-ai-001",
                    "primaryLocale": "en-US"
                }
            }
        }
        status, res = api_request("https://api.appstoreconnect.apple.com/v1/apps", app_payload)
        if status in (200, 201):
            print(f"✓ Successfully created App in App Store Connect!")
        else:
            print(f"App creation response ({status}): {res}")

print("Pre-flight registration step complete!")
