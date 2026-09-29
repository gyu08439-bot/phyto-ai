#!/usr/bin/env python3
import os
import sys
import time
import json
import base64
import subprocess
import urllib.request
import urllib.error

try:
    import jwt
    from cryptography.hazmat.primitives.asymmetric import rsa
    from cryptography.hazmat.primitives import serialization, hashes
    from cryptography import x509
    from cryptography.x509.oid import NameOID
    from cryptography.hazmat.primitives.serialization import pkcs12
except ImportError:
    subprocess.check_call([sys.executable, "-m", "pip", "install", "pyjwt", "cryptography"])
    import jwt
    from cryptography.hazmat.primitives.asymmetric import rsa
    from cryptography.hazmat.primitives import serialization, hashes
    from cryptography import x509
    from cryptography.x509.oid import NameOID
    from cryptography.hazmat.primitives.serialization import pkcs12

KEY_ID = os.environ.get("APP_STORE_CONNECT_KEY_ID")
ISSUER_ID = os.environ.get("APP_STORE_CONNECT_ISSUER_ID")
KEY_CONTENT = os.environ.get("APP_STORE_CONNECT_API_KEY_CONTENT")
TEAM_ID = os.environ.get("APPLE_TEAM_ID")
BUILD_NUMBER = os.environ.get("GITHUB_RUN_NUMBER", str(int(time.time() / 100)))

if not KEY_ID or not ISSUER_ID or not KEY_CONTENT:
    print("Error: Missing App Store Connect API credentials")
    sys.exit(1)

raw_key = KEY_CONTENT.strip()
if not raw_key.startswith("-----BEGIN"):
    formatted_pem = "-----BEGIN PRIVATE KEY-----\n" + raw_key + "\n-----END PRIVATE KEY-----"
else:
    formatted_pem = raw_key.replace("\\n", "\n")

home = os.path.expanduser("~")
for kd in [os.path.join(home, ".appstoreconnect", "private_keys"), os.path.join(home, ".private_keys")]:
    os.makedirs(kd, exist_ok=True)
    p8_path = os.path.join(kd, f"AuthKey_{KEY_ID}.p8")
    with open(p8_path, "w") as kf:
        kf.write(formatted_pem + "\n")
    os.chmod(p8_path, 0o600)
    print(f"Saved API key to: {p8_path}")

now = int(time.time())
payload = {"iss": ISSUER_ID, "iat": now, "exp": now + 1200, "aud": "appstoreconnect-v1"}
headers = {"kid": KEY_ID, "alg": "ES256", "typ": "JWT"}

token = jwt.encode(payload, formatted_pem, algorithm="ES256", headers=headers)
if isinstance(token, bytes):
    token = token.decode("utf-8")

def api_request(url, data=None, method=None):
    req_headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json", "Accept": "application/json"}
    body = json.dumps(data).encode("utf-8") if data else None
    req = urllib.request.Request(url, data=body, headers=req_headers, method=method)
    try:
        with urllib.request.urlopen(req) as resp:
            return resp.status, json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        err_body = e.read().decode("utf-8")
        try:
            return e.code, json.loads(err_body)
        except Exception:
            return e.code, {"raw": err_body}
    except Exception as e:
        return 500, {"error": str(e)}

print("\n--- STEP 1: Verify Authentication ---")
status, res = api_request("https://api.appstoreconnect.apple.com/v1/apps?limit=5")
if status != 200:
    print(f"Failed to authenticate with App Store Connect API: HTTP {status}", res)
    sys.exit(1)
print("App Store Connect API Authenticated successfully!")

print("\n--- STEP 2: Bundle ID Registration ---")
candidate_bundle_ids = ["com.floraai.app", "com.floraai.plantdoctor", "com.floraai.bot", "com.flora.ai"]
selected_bundle_id = None
bundle_obj_id = None

for bid in candidate_bundle_ids:
    print(f"Checking Bundle ID: {bid}...")
    status, res = api_request(f"https://api.appstoreconnect.apple.com/v1/bundleIds?filter[identifier]={bid}")
    if status == 200 and res.get("data") and len(res["data"]) > 0:
        selected_bundle_id = bid
        bundle_obj_id = res["data"][0]["id"]
        print(f"Found existing Bundle ID: {bid} (ID: {bundle_obj_id})")
        break
    else:
        create_payload = {"data": {"type": "bundleIds", "attributes": {"identifier": bid, "name": "Flora AI", "platform": "UNIVERSAL"}}}
        status, res = api_request("https://api.appstoreconnect.apple.com/v1/bundleIds", create_payload)
        if status in (200, 201) and res.get("data"):
            selected_bundle_id = bid
            bundle_obj_id = res["data"]["id"]
            print(f"Successfully registered Bundle ID: {bid} (ID: {bundle_obj_id})")
            break

if not selected_bundle_id:
    random_bid = f"com.floraai.app{int(time.time()) % 10000}"
    create_payload = {"data": {"type": "bundleIds", "attributes": {"identifier": random_bid, "name": "Flora AI", "platform": "UNIVERSAL"}}}
    status, res = api_request("https://api.appstoreconnect.apple.com/v1/bundleIds", create_payload)
    if status in (200, 201) and res.get("data"):
        selected_bundle_id = random_bid
        bundle_obj_id = res["data"]["id"]
        print(f"Successfully registered Bundle ID: {selected_bundle_id}")
    else:
        print("Failed to register Bundle ID", res)
        sys.exit(1)

print(f"Target Bundle ID: {selected_bundle_id}")

print("\n--- STEP 3: App Store Connect App Record ---")
status, res = api_request(f"https://api.appstoreconnect.apple.com/v1/apps?filter[bundleId]={selected_bundle_id}")
if status == 200 and res.get("data") and len(res["data"]) > 0:
    print(f"App already exists: {res['data'][0]['attributes']['name']}")
else:
    for app_name in ["Flora AI: Plant Doctor", "Flora AI - Plant Disease Doctor", "Flora AI Plant Care & Doctor", f"Flora AI Doctor {int(time.time()) % 1000}"]:
        app_payload = {
            "data": {
                "type": "apps",
                "attributes": {"name": app_name, "sku": f"FLORA_AI_{int(time.time())}", "primaryLocale": "en-US"},
                "relationships": {"bundleId": {"data": {"type": "bundleIds", "id": bundle_obj_id}}}
            }
        }
        status, res = api_request("https://api.appstoreconnect.apple.com/v1/apps", app_payload)
        if status in (200, 201) and res.get("data"):
            print(f"Successfully created App record: {app_name}")
            break

print("\n--- STEP 4: Apple Distribution Certificate ---")
status, res = api_request("https://api.appstoreconnect.apple.com/v1/certificates?filter[certificateType]=DISTRIBUTION,IOS_DISTRIBUTION")
existing_certs = res.get("data", []) if status == 200 else []
print(f"Found {len(existing_certs)} distribution certificate(s).")

# Clean up any orphaned CI certificates from previous runs
for c in existing_certs:
    c_attr = c.get("attributes", {})
    c_name = c_attr.get("name", "")
    c_id = c.get("id")
    print(f"  Existing cert: ID={c_id}, Name='{c_name}'")
    if "Flora" in c_name or "CI" in c_name:
        print(f"  Cleaning up orphaned CI cert {c_id} ('{c_name}')...")
        del_st, _ = api_request(f"https://api.appstoreconnect.apple.com/v1/certificates/{c_id}", method="DELETE")
        print(f"  Revocation status: {del_st}")

# Re-query certificates after cleanup
status, res = api_request("https://api.appstoreconnect.apple.com/v1/certificates?filter[certificateType]=DISTRIBUTION,IOS_DISTRIBUTION")
existing_certs = res.get("data", []) if status == 200 else []
print(f"Active certificates after cleanup: {len(existing_certs)}")

cert_id = None
p12_path = os.path.abspath("build/AppleDistribution.p12")
os.makedirs("build", exist_ok=True)

print("Generating fresh RSA 2048 key and CSR for Apple Distribution...")
key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
csr = x509.CertificateSigningRequestBuilder().subject_name(x509.Name([
    x509.NameAttribute(NameOID.COMMON_NAME, u"Apple Distribution: Flora AI CI"),
])).sign(key, hashes.SHA256())
csr_pem = csr.public_bytes(serialization.Encoding.PEM).decode("utf-8")

cert_payload = {"data": {"type": "certificates", "attributes": {"certificateType": "DISTRIBUTION", "csrContent": csr_pem}}}
status, res = api_request("https://api.appstoreconnect.apple.com/v1/certificates", cert_payload)

if status in (200, 201) and res.get("data"):
    cert_data = res["data"]
    cert_id = cert_data["id"]
    cert_der = base64.b64decode(cert_data["attributes"]["certificateContent"])
    cert_obj = x509.load_der_x509_certificate(cert_der)
    p12_bytes = pkcs12.serialize_key_and_certificates(
        name=b"Apple Distribution: Flora AI",
        key=key,
        cert=cert_obj,
        cas=None,
        encryption_algorithm=serialization.BestAvailableEncryption(b"actions_password")
    )
    with open(p12_path, "wb") as pf:
        pf.write(p12_bytes)
    print(f"Saved Apple Distribution identity to {p12_path} (Cert ID: {cert_id})")

    if sys.platform == "darwin":
        subprocess.run(["security", "create-keychain", "-p", "actions_password", "build.keychain"], check=False)
        subprocess.run(["security", "default-keychain", "-s", "build.keychain"], check=False)
        subprocess.run(["security", "unlock-keychain", "-p", "actions_password", "build.keychain"], check=False)
        subprocess.run(["security", "set-keychain-settings", "-t", "3600", "-u", "build.keychain"], check=False)
        
        # Download and import Apple WWDR intermediate certificates
        for wwdr_url, fname in [
            ("https://www.apple.com/certificateauthority/AppleWWDRCAG3.cer", "AppleWWDRCAG3.cer"),
            ("https://www.apple.com/certificateauthority/AppleWWDRCA.cer", "AppleWWDRCA.cer")
        ]:
            try:
                fpath = os.path.join("build", fname)
                urllib.request.urlretrieve(wwdr_url, fpath)
                subprocess.run(["security", "import", fpath, "-k", "build.keychain"], check=False)
            except Exception as e:
                print(f"WWDR download note: {e}")

        # Add build.keychain to keychain search list
        res_kc = subprocess.run(["security", "list-keychains", "-d", "user"], capture_output=True, text=True)
        cur_kcs = [k.strip().strip('"') for k in res_kc.stdout.splitlines() if k.strip()]
        if "build.keychain" not in cur_kcs:
            subprocess.run(["security", "list-keychains", "-d", "user", "-s", "build.keychain"] + cur_kcs, check=False)

        # Import p12 into build.keychain
        subprocess.run(["security", "import", p12_path, "-k", "build.keychain", "-P", "actions_password", "-T", "/usr/bin/codesign", "-T", "/usr/bin/security"], check=False)
        subprocess.run(["security", "set-key-partition-list", "-S", "apple-tool:,apple:,codesign:", "-s", "-k", "actions_password", "build.keychain"], check=False)
        print("✓ Imported certificate into macOS build keychain")
        subprocess.run(["security", "find-identity", "-v", "-p", "codesigning", "build.keychain"])
else:
    print(f"❌ Failed to create certificate: {res}")
    sys.exit(1)

print("\n--- STEP 5: Provisioning Profile Setup ---")
profiles_dir = os.path.expanduser("~/Library/MobileDevice/Provisioning Profiles")
os.makedirs(profiles_dir, exist_ok=True)

# Create a fresh profile linked to our new certificate and bundle ID
active_profile_uuid = None
active_profile_name = None

print(f"Creating fresh App Store provisioning profile for {selected_bundle_id} linked to cert {cert_id}...")
prof_payload = {
    "data": {
        "type": "profiles",
        "attributes": {"name": f"Flora AI AppStore {int(time.time())}", "profileType": "IOS_APP_STORE"},
        "relationships": {
            "bundleId": {"data": {"type": "bundleIds", "id": bundle_obj_id}},
            "certificates": {"data": [{"type": "certificates", "id": cert_id}]}
        }
    }
}
status, res = api_request("https://api.appstoreconnect.apple.com/v1/profiles", prof_payload)
if status in (200, 201) and res.get("data"):
    content = base64.b64decode(res["data"]["attributes"]["profileContent"])
    active_profile_uuid = res["data"]["attributes"].get("uuid", res["data"]["id"])
    active_profile_name = res["data"]["attributes"]["name"]
    with open(os.path.join(profiles_dir, f"{active_profile_uuid}.mobileprovision"), "wb") as mf:
        mf.write(content)
    print(f"Created and installed profile: {active_profile_name} ({active_profile_uuid})")
else:
    # If 409 because an active profile already exists, find and download it
    print(f"Profile creation returned {status}: {res.get('errors', [{}])[0].get('detail', res)}")
    status, res = api_request(f"https://api.appstoreconnect.apple.com/v1/profiles?filter[profileType]=IOS_APP_STORE&filter[bundleId.identifier]={selected_bundle_id}")
    if status == 200 and res.get("data"):
        for prof in res["data"]:
            content = base64.b64decode(prof["attributes"]["profileContent"])
            active_profile_uuid = prof["attributes"].get("uuid", prof["id"])
            active_profile_name = prof["attributes"]["name"]
            with open(os.path.join(profiles_dir, f"{active_profile_uuid}.mobileprovision"), "wb") as mf:
                mf.write(content)
            print(f"Installed existing profile: {active_profile_name} ({active_profile_uuid})")
            break

env_file = os.environ.get("GITHUB_ENV")
if env_file and active_profile_uuid:
    with open(env_file, "a") as ef:
        ef.write(f"PROFILE_UUID={active_profile_uuid}\n")
        ef.write(f"TARGET_BUNDLE_ID={selected_bundle_id}\n")
    print(f"Exported PROFILE_UUID={active_profile_uuid} to GITHUB_ENV")

print("\n--- STEP 6: Update Local Files ---")
for c_path in ["capacitor.config.json", "ios/App/App/capacitor.config.json"]:
    if os.path.exists(c_path):
        with open(c_path, "r") as cf:
            cap_cfg = json.load(cf)
        cap_cfg["appId"] = selected_bundle_id
        with open(c_path, "w") as cf:
            json.dump(cap_cfg, cf, indent=2)
        print(f"Updated appId in {c_path}")

pbx_path = "ios/App/App.xcodeproj/project.pbxproj"
if os.path.exists(pbx_path):
    with open(pbx_path, "r") as pf:
        pbx = pf.read()
    import re
    pbx = re.sub(r"PRODUCT_BUNDLE_IDENTIFIER = [^;]+;", f"PRODUCT_BUNDLE_IDENTIFIER = {selected_bundle_id};", pbx)
    pbx = re.sub(r"CURRENT_PROJECT_VERSION = [^;]+;", f"CURRENT_PROJECT_VERSION = {BUILD_NUMBER};", pbx)
    pbx = re.sub(r"CODE_SIGN_STYLE = Automatic;", "CODE_SIGN_STYLE = Manual;", pbx)
    pbx = re.sub(r'CODE_SIGN_IDENTITY = "[^"]*";', 'CODE_SIGN_IDENTITY = "Apple Distribution";', pbx)
    pbx = re.sub(r'CODE_SIGN_IDENTITY = iPhone Developer;', 'CODE_SIGN_IDENTITY = "Apple Distribution";', pbx)
    if TEAM_ID:
        if "DEVELOPMENT_TEAM" in pbx:
            pbx = re.sub(r"DEVELOPMENT_TEAM = [^;]+;", f"DEVELOPMENT_TEAM = {TEAM_ID};", pbx)
        else:
            pbx = pbx.replace("CODE_SIGN_STYLE = Manual;", f"CODE_SIGN_STYLE = Manual;\n\t\t\t\tDEVELOPMENT_TEAM = {TEAM_ID};")
    if active_profile_uuid:
        if "PROVISIONING_PROFILE_SPECIFIER" in pbx:
            pbx = re.sub(r"PROVISIONING_PROFILE_SPECIFIER = [^;]+;", f'PROVISIONING_PROFILE_SPECIFIER = "{active_profile_uuid}";', pbx)
        else:
            pbx = pbx.replace("CODE_SIGN_STYLE = Manual;", f'CODE_SIGN_STYLE = Manual;\n\t\t\t\tPROVISIONING_PROFILE_SPECIFIER = "{active_profile_uuid}";')
    with open(pbx_path, "w") as pf:
        pf.write(pbx)
    print(f"Updated {pbx_path} with Manual Signing and profile UUID {active_profile_uuid}")

export_opts = "ios/App/exportOptions.plist"
if os.path.exists(export_opts) and TEAM_ID and active_profile_uuid:
    export_dict = f"""<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>method</key>
    <string>app-store</string>
    <key>destination</key>
    <string>export</string>
    <key>signingStyle</key>
    <string>manual</string>
    <key>teamID</key>
    <string>{TEAM_ID}</string>
    <key>signingCertificate</key>
    <string>Apple Distribution</string>
    <key>provisioningProfiles</key>
    <dict>
        <key>{selected_bundle_id}</key>
        <string>{active_profile_uuid}</string>
    </dict>
    <key>manageAppVersionAndBuildNumber</key>
    <true/>
</dict>
</plist>
"""
    with open(export_opts, "w") as ef:
        ef.write(export_dict)
    print(f"Updated {export_opts} with complete manual signing dictionary")

print("\nSetup finished successfully!")
