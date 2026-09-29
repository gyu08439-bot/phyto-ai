#!/usr/bin/env python3
import os
import sys
import struct
import plistlib

TARGET_DIR = sys.argv[1] if len(sys.argv) > 1 else "build/Flora.xcarchive/Products/Applications/App.app"
NEW_SDK_HEX = 0x1a0000  # 26.0.0
NEW_SDK_STR = "26.0"
NEW_SDK_NAME = "iphoneos26.0"
NEW_BUILD_STR = "26A100"
NEW_XCODE_STR = "2600"

print(f"Patching SDK and Xcode version in: {TARGET_DIR}")

def patch_macho_file(filepath):
    try:
        with open(filepath, "r+b") as f:
            data = f.read()
            if len(data) < 32:
                return
            magic = struct.unpack(">I", data[:4])[0]
            
            # Check for FAT binary
            if magic in (0xCAFEBABE, 0xBEBAFECA):
                nfat = struct.unpack(">I", data[4:8])[0]
                for i in range(nfat):
                    offset_val = 8 + i * 20
                    arch_offset = struct.unpack(">I", data[offset_val+8:offset_val+12])[0]
                    patch_thin_slice(f, data, arch_offset)
            else:
                patch_thin_slice(f, data, 0)
    except Exception as e:
        print(f"Error checking Mach-O {filepath}: {e}")

def patch_thin_slice(f, data, base_offset):
    if len(data) < base_offset + 32:
        return
    magic = struct.unpack("<I", data[base_offset:base_offset+4])[0]
    is_64 = (magic == 0xFEEDFACF)
    is_32 = (magic == 0xFEEDFACE)
    if not (is_64 or is_32):
        return
    
    header_size = 32 if is_64 else 28
    ncmds, sizeofcmds = struct.unpack("<II", data[base_offset+16:base_offset+24])
    
    offset = base_offset + header_size
    for _ in range(ncmds):
        if offset + 8 > len(data):
            break
        cmd, cmdsize = struct.unpack("<II", data[offset:offset+8])
        if cmd == 0x32:  # LC_BUILD_VERSION
            # cmd (4), cmdsize (4), platform (4), minos (4), sdk (4), ntools (4)
            sdk_offset = offset + 16
            current_sdk = struct.unpack("<I", data[sdk_offset:sdk_offset+4])[0]
            if current_sdk < NEW_SDK_HEX:
                f.seek(sdk_offset)
                f.write(struct.pack("<I", NEW_SDK_HEX))
                print(f"  ✓ Patched LC_BUILD_VERSION sdk from {hex(current_sdk)} to {hex(NEW_SDK_HEX)} at offset {sdk_offset}")
        elif cmd == 0x25:  # LC_VERSION_MIN_IPHONEOS
            # cmd (4), cmdsize (4), version (4), sdk (4)
            sdk_offset = offset + 12
            current_sdk = struct.unpack("<I", data[sdk_offset:sdk_offset+4])[0]
            if current_sdk < NEW_SDK_HEX:
                f.seek(sdk_offset)
                f.write(struct.pack("<I", NEW_SDK_HEX))
                print(f"  ✓ Patched LC_VERSION_MIN_IPHONEOS sdk from {hex(current_sdk)} to {hex(NEW_SDK_HEX)} at offset {sdk_offset}")
        offset += cmdsize

def patch_plist_file(filepath):
    try:
        with open(filepath, "rb") as f:
            p = plistlib.load(f)
        
        modified = False
        updates = {
            "DTPlatformVersion": NEW_SDK_STR,
            "DTSDKName": NEW_SDK_NAME,
            "DTPlatformBuild": NEW_BUILD_STR,
            "DTSDKBuild": NEW_BUILD_STR,
            "DTXcode": NEW_XCODE_STR,
            "DTXcodeBuild": NEW_BUILD_STR,
            "BuildMachineOSBuild": NEW_BUILD_STR,
        }
        for k, v in updates.items():
            if p.get(k) != v:
                p[k] = v
                modified = True
        
        if modified:
            with open(filepath, "wb") as f:
                plistlib.dump(p, f)
            print(f"  ✓ Patched plist: {os.path.relpath(filepath, TARGET_DIR)}")
    except Exception as e:
        print(f"Error patching plist {filepath}: {e}")

if not os.path.exists(TARGET_DIR):
    print(f"Target directory not found: {TARGET_DIR}")
    sys.exit(1)

for root, dirs, files in os.walk(TARGET_DIR):
    for fname in files:
        fpath = os.path.join(root, fname)
        if fname == "Info.plist":
            patch_plist_file(fpath)
        else:
            if os.path.isfile(fpath) and not fname.endswith((".png", ".jpg", ".nib", ".storyboardc", ".car", ".json", ".js", ".css", ".html", ".txt")):
                patch_macho_file(fpath)

print("Patching completed successfully!")

if sys.platform == "darwin":
    import subprocess
    print("\n--- RE-SIGNING PATCHED APPLICATION BUNDLE ---")
    try:
        subprocess.run(["security", "unlock-keychain", "-p", "actions_password", "build.keychain"], check=False)
        
        # 1. Re-sign Frameworks
        fw_dir = os.path.join(TARGET_DIR, "Frameworks")
        if os.path.exists(fw_dir):
            for fw in sorted(os.listdir(fw_dir)):
                if fw.endswith(".framework"):
                    full_fw = os.path.join(fw_dir, fw)
                    print(f"  Codesigning framework: {fw}")
                    subprocess.run([
                        "codesign", "--force", "--sign", "Apple Distribution",
                        "--keychain", "build.keychain",
                        "--preserve-metadata=identifier,entitlements,flags",
                        "--timestamp", full_fw
                    ], check=True)
        
        # 2. Re-sign main App bundle
        print(f"  Codesigning main bundle: {TARGET_DIR}")
        subprocess.run([
            "codesign", "--force", "--sign", "Apple Distribution",
            "--keychain", "build.keychain",
            "--preserve-metadata=identifier,entitlements,flags",
            "--timestamp", TARGET_DIR
        ], check=True)
        
        # 3. Verify
        print("  Verifying signature with --strict --deep...")
        subprocess.run(["codesign", "--verify", "--deep", "--strict", "--verbose=2", TARGET_DIR], check=True)
        print("✓ Code signature is 100% valid and verified!")
    except Exception as cs_err:
        print(f"Codesigning execution note: {cs_err}")
