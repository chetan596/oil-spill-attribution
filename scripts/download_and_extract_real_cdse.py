import os
import sys
import json
import time
import zipfile
import urllib.request
import urllib.parse
from pathlib import Path
from dotenv import dotenv_values

def main():
    print("==================================================================")
    print("Copernicus Data Space Ecosystem (CDSE) Real SAR Acquisition")
    print("==================================================================")

    env_path = Path("services/backend-node/.env")
    if not env_path.exists():
        print("STATUS: CDSE_AUTHENTICATION_REQUIRED")
        sys.exit(1)

    env_vars = dotenv_values(env_path)
    username = env_vars.get("CDSE_USERNAME", "").strip()
    password = env_vars.get("CDSE_PASSWORD", "").strip()

    if not username or not password:
        print("CDSE_USERNAME = MISSING")
        print("CDSE_PASSWORD = MISSING")
        print("STATUS: CDSE_AUTHENTICATION_REQUIRED")
        sys.exit(1)

    print("CDSE_USERNAME = DETECTED")
    print("CDSE_PASSWORD = DETECTED")

    # Keycloak OAuth Token Request
    token_url = "https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token"
    data = {
        "client_id": "cdse-public",
        "username": username,
        "password": password,
        "grant_type": "password",
    }
    encoded_data = urllib.parse.urlencode(data).encode("utf-8")
    req = urllib.request.Request(token_url, data=encoded_data, method="POST")
    req.add_header("Content-Type", "application/x-www-form-urlencoded")

    print("Authenticating with CDSE Keycloak OAuth2...")
    try:
        with urllib.request.urlopen(req, timeout=30) as response:
            token_json = json.loads(response.read().decode("utf-8"))
            access_token = token_json.get("access_token")
    except Exception as e:
        print(f"Authentication failed: {e}")
        print("STATUS: CDSE_AUTHENTICATION_REQUIRED")
        sys.exit(1)

    if not access_token:
        print("No access token acquired.")
        print("STATUS: CDSE_AUTHENTICATION_REQUIRED")
        sys.exit(1)

    print("CDSE Keycloak Authentication Successful. Token acquired in-memory.")

    product_id = "S1A_IW_GRDH_1SDV_20240218T010329_20240218T010354_052606_065D1D_A8B1_COG"
    product_uuid = "3f5c4ba1-ed70-4065-91b9-2bbeb7ebfb79"

    target_dir = Path("data/raw/satellite/cdse") / product_id
    target_dir.mkdir(parents=True, exist_ok=True)

    zip_path = target_dir / f"{product_id}.zip"

    # Check if download already completed
    expected_size = 996690709
    if zip_path.exists() and zip_path.stat().st_size == expected_size:
        print(f"Product zip archive already downloaded ({zip_path.stat().st_size} bytes).")
    else:
        download_url = f"https://zipper.dataspace.copernicus.eu/odata/v1/Products({product_uuid})/$value"
        print(f"Streaming real Sentinel-1 product from CDSE Zipper: {download_url}...")
        
        d_req = urllib.request.Request(download_url, method="GET")
        d_req.add_header("Authorization", f"Bearer {access_token}")

        try:
            start_time = time.time()
            with urllib.request.urlopen(d_req, timeout=120) as response, open(zip_path, "wb") as out_file:
                total_len_header = response.headers.get("Content-Length")
                total_len = int(total_len_header) if total_len_header else expected_size
                print(f"Remote Content-Length: {total_len:,} bytes (~{total_len / (1024*1024):.1f} MB)")
                
                downloaded = 0
                block_size = 4 * 1024 * 1024  # 4 MB blocks
                last_print = time.time()
                
                while True:
                    chunk = response.read(block_size)
                    if not chunk:
                        break
                    out_file.write(chunk)
                    downloaded += len(chunk)
                    
                    if time.time() - last_print >= 5.0 or downloaded == total_len:
                        pct = (downloaded / total_len) * 100 if total_len else 0
                        mb = downloaded / (1024 * 1024)
                        elapsed = time.time() - start_time
                        speed = mb / elapsed if elapsed > 0 else 0
                        print(f"  Downloaded: {mb:.1f} MB / {total_len / (1024*1024):.1f} MB ({pct:.1f}%) — {speed:.2f} MB/s")
                        last_print = time.time()
            
            print(f"Download complete: {zip_path} ({zip_path.stat().st_size:,} bytes) in {time.time() - start_time:.1f}s")
        except Exception as e:
            print(f"Download error: {e}")
            print("STATUS: CDSE_REAL_SAR_DOWNLOAD_FAILED")
            sys.exit(1)

    # Validate zip integrity and extract genuine measurement assets
    print(f"\nInspecting downloaded product archive: {zip_path}...")
    try:
        with zipfile.ZipFile(zip_path, "r") as z:
            namelist = z.namelist()
            print(f"Archive contains {len(namelist)} entries.")
            
            # Find measurement and annotation entries
            measurement_entries = [n for n in namelist if "measurement/" in n and (n.endswith(".tiff") or n.endswith(".tif"))]
            annotation_entries = [n for n in namelist if "annotation/" in n and n.endswith(".xml")]
            manifest_entries = [n for n in namelist if n.endswith("manifest.safe")]

            print("Measurement entries found:")
            for m in measurement_entries:
                info = z.getinfo(m)
                print(f"  - {m} ({info.file_size:,} bytes uncompressed)")

            print("Annotation / Calibration entries found:")
            for a in annotation_entries[:5]:
                print(f"  - {a}")

            print("\nExtracting genuine measurement & annotation files...")
            extract_entries = measurement_entries + annotation_entries + manifest_entries
            for entry in extract_entries:
                z.extract(entry, target_dir)
            print(f"Extracted {len(extract_entries)} genuine CDSE observation assets.")
    except Exception as e:
        print(f"Extraction error: {e}")
        print("STATUS: CDSE_REAL_SAR_DOWNLOAD_FAILED")
        sys.exit(1)

    print("\nSUCCESS: Product downloaded and extracted successfully from CDSE.")

if __name__ == "__main__":
    main()
