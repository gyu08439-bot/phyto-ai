#!/usr/bin/env python3
import os
import sys
import time
import json
import hashlib
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

def upload_screenshot(sub_id, image_path):
    print(f"\n==========================================")
    print(f"Uploading review screenshot for subscription {sub_id} from {image_path}...")
    
    with open(image_path, "rb") as f:
        file_bytes = f.read()
    file_size = len(file_bytes)
    sha256_checksum = hashlib.sha256(file_bytes).hexdigest()
    file_name = os.path.basename(image_path)

    # 1. Check existing review screenshot and delete if exists
    url = f"https://api.appstoreconnect.apple.com/v1/subscriptions/{sub_id}/appStoreReviewScreenshot"
    r = requests.get(url, headers=HEADERS)
    if r.status_code == 200 and r.json().get("data"):
        old_id = r.json()["data"]["id"]
        print(f"Found existing screenshot ID: {old_id}. Deleting...")
        del_res = requests.delete(f"https://api.appstoreconnect.apple.com/v1/subscriptionAppStoreReviewScreenshots/{old_id}", headers=HEADERS)
        print(f"Delete response: {del_res.status_code}")
        time.sleep(1)

    # 2. Reserve asset
    reserve_payload = {
        "data": {
            "type": "subscriptionAppStoreReviewScreenshots",
            "attributes": {
                "fileName": file_name,
                "fileSize": file_size
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
    r = requests.post("https://api.appstoreconnect.apple.com/v1/subscriptionAppStoreReviewScreenshots", json=reserve_payload, headers=HEADERS)
    if r.status_code not in (200, 201):
        print(f"❌ Failed to reserve screenshot asset: {r.status_code}", r.text)
        return False

    res_data = r.json()["data"]
    asset_id = res_data["id"]
    upload_ops = res_data["attributes"]["uploadOperations"]
    print(f"✓ Reserved screenshot asset ID: {asset_id} ({len(upload_ops)} upload operations)")

    # 3. Upload chunks
    for idx, op in enumerate(upload_ops):
        op_url = op["url"]
        op_method = op["method"]
        op_offset = op["offset"]
        op_length = op["length"]
        op_headers = {h["name"]: h["value"] for h in op.get("requestHeaders", [])}

        chunk = file_bytes[op_offset : op_offset + op_length]
        up_res = requests.request(op_method, op_url, data=chunk, headers=op_headers)
        if up_res.status_code not in (200, 201):
            print(f"❌ Chunk upload {idx+1} failed: {up_res.status_code}", up_res.text)
            return False
        print(f"  Uploaded chunk {idx+1}/{len(upload_ops)} ({op_length} bytes)")

    # 4. Commit asset
    commit_payload = {
        "data": {
            "type": "subscriptionAppStoreReviewScreenshots",
            "id": asset_id,
            "attributes": {
                "uploaded": True,
                "sourceFileChecksum": sha256_checksum
            }
        }
    }
    patch_res = requests.patch(f"https://api.appstoreconnect.apple.com/v1/subscriptionAppStoreReviewScreenshots/{asset_id}", json=commit_payload, headers=HEADERS)
    if patch_res.status_code not in (200, 201):
        print(f"❌ Failed to commit screenshot: {patch_res.status_code}", patch_res.text)
        return False

    print(f"✓ Successfully committed asset {asset_id}. Polling delivery state...")
    
    # 5. Poll asset delivery state
    for attempt in range(12):
        time.sleep(3)
        chk = requests.get(f"https://api.appstoreconnect.apple.com/v1/subscriptionAppStoreReviewScreenshots/{asset_id}", headers=HEADERS)
        if chk.status_code == 200:
            state_data = chk.json()["data"]["attributes"].get("assetDeliveryState", {})
            state = state_data.get("state")
            print(f"  [{attempt+1}/12] Asset state: {state}")
            if state == "COMPLETE":
                print(f"🎉 Screenshot for subscription {sub_id} is COMPLETE & ACCEPTED by Apple!")
                return True
            elif state == "FAILED":
                print(f"❌ Apple processing FAILED:", state_data.get("errors"))
                return False

    return True

# Subscription IDs:
SUBS = [
    ("6818063327", "flora_annual_2999", "scripts/assets/flora_annual_1242x2688.png"),
    ("6818063612", "flora_monthly_799", "scripts/assets/flora_monthly_1242x2688.png")
]

all_success = True
for sub_id, pid, path in SUBS:
    success = upload_screenshot(sub_id, path)
    if not success:
        # Fallback to 640x920 if 1242x2688 fails
        alt_path = path.replace("1242x2688", "640x920")
        print(f"Retrying with 640x920: {alt_path}...")
        success = upload_screenshot(sub_id, alt_path)
    if not success:
        all_success = False

print("\n=== ALL SCREENSHOT UPLOADS FINISHED ===")
if all_success:
    print("✓ All Review Screenshots successfully uploaded directly to App Store Connect!")
else:
    print("⚠️ Some uploads failed, see logs above.")
