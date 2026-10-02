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
max_attempts = 18
valid_builds = []

for attempt in range(max_attempts):
    status, res = api_get(f"https://api.appstoreconnect.apple.com/v1/builds?filter[app]={APP_ID}&limit=10")
    if status == 200:
        data = res.get("data", [])
        has_processing = False
        valid_builds = []
        for b in data:
            bid = b.get("id")
            attr = b.get("attributes", {})
            version = attr.get("version")
            state = attr.get("processingState")
            uploaded = attr.get("uploadedDate")
            print(f"  - Build: ID={bid}, Version/Build={version}, State={state}, Uploaded={uploaded}")
            if state == "PROCESSING":
                has_processing = True
            elif state == "VALID":
                valid_builds.append(b)

        if not has_processing and len(valid_builds) > 0:
            print(f"\n✓ All latest builds processed by Apple! Total valid builds: {len(valid_builds)}")
            break
        elif has_processing:
            print(f"\n⏳ Latest build is still PROCESSING by Apple. Waiting 25s (attempt {attempt+1}/{max_attempts})...")
            time.sleep(25)
    else:
        print("Error querying builds:", res)
        time.sleep(15)


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
bg_ids = []
if status == 200:
    for bg in res.get("data", []):
        bg_id = bg.get("id")
        bg_ids.append(bg_id)
        pattr = bg.get("attributes", {})
        group_name = pattr.get('name')
        is_internal = pattr.get('isInternalGroup')
        public_link = pattr.get('publicLink')
        print(f"  - Beta Group: ID={bg_id}, Name='{group_name}', isInternalGroup={is_internal}, publicLink={public_link}")

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

        # Check testers in this beta group
        t_status, t_res = api_get(f"https://api.appstoreconnect.apple.com/v1/betaGroups/{bg_id}/betaTesters")
        testers_in_group = []
        if t_status == 200:
            for t in t_res.get("data", []):
                t_attr = t.get("attributes", {})
                print(f"    - Tester in '{group_name}': {t_attr.get('email')} ({t_attr.get('firstName')} {t_attr.get('lastName')}, State: {t_attr.get('state')})")
                testers_in_group.append(t.get("id"))
        else:
            print(f"    - Error querying testers in group: HTTP {t_status} {t_res}")

print("\n=== CHECKING ALL BETA TESTERS IN ACCOUNT ===")
bt_status, bt_res = api_get("https://api.appstoreconnect.apple.com/v1/betaTesters?limit=50")
all_tester_ids = []
if bt_status == 200:
    for t in bt_res.get("data", []):
        t_id = t.get("id")
        t_attr = t.get("attributes", {})
        email = t_attr.get("email")
        print(f"  - Account Beta Tester: ID={t_id}, Email={email}, Name={t_attr.get('firstName')} {t_attr.get('lastName')}")
        all_tester_ids.append((t_id, email))
else:
    print(f"Error querying betaTesters: HTTP {bt_status} {bt_res}")

print("\n=== CHECKING APP STORE CONNECT USERS / TEAM ===")
u_status, u_res = api_get("https://api.appstoreconnect.apple.com/v1/users?limit=50")
team_users = []
if u_status == 200:
    for u in u_res.get("data", []):
        u_id = u.get("id")
        u_attr = u.get("attributes", {})
        u_email = u_attr.get("username")
        roles = u_attr.get("roles")
        print(f"  - Team User: ID={u_id}, Email={u_email}, Name={u_attr.get('firstName')} {u_attr.get('lastName')}, Roles={roles}")
        team_users.append((u_id, u_email, u_attr.get('firstName'), u_attr.get('lastName')))
else:
    print(f"Error querying users: HTTP {u_status} {u_res}")

# Add testers to Flora AI beta groups
for bg_id in bg_ids:
    for t_id, email in all_tester_ids:
        print(f"Adding tester {email} ({t_id}) to Beta Group {bg_id}...")
        add_payload = {"data": [{"type": "betaTesters", "id": t_id}]}
        a_status, a_res = api_post(f"https://api.appstoreconnect.apple.com/v1/betaGroups/{bg_id}/relationships/betaTesters", add_payload)
        print(f"  --> Result: HTTP {a_status} {a_res}")

    # If team users not in betaTesters, invite them
    existing_emails = {email.lower() for _, email in all_tester_ids}
    for _, u_email, fn, ln in team_users:
        if u_email.lower() not in existing_emails:
            print(f"Creating beta tester for team user {u_email}...")
            create_tester_payload = {
                "data": {
                    "type": "betaTesters",
                    "attributes": {
                        "email": u_email,
                        "firstName": fn or "Flora",
                        "lastName": ln or "Tester"
                    },
                    "relationships": {
                        "betaGroups": {
                            "data": [{"type": "betaGroups", "id": bg_id}]
                        }
                    }
                }
            }
            c_status, c_res = api_post("https://api.appstoreconnect.apple.com/v1/betaTesters", create_tester_payload)
            print(f"  --> Result: HTTP {c_status} {c_res}")

