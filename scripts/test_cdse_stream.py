import os
import sys
import json
import urllib.request
from pathlib import Path
from dotenv import dotenv_values

env_path = Path("services/backend-node/.env")
env_vars = dotenv_values(env_path)
username = env_vars.get("CDSE_USERNAME", "").strip()
password = env_vars.get("CDSE_PASSWORD", "").strip()

token_url = "https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token"
data = {
    "client_id": "cdse-public",
    "username": username,
    "password": password,
    "grant_type": "password",
}

encoded_data = urllib.parse.urlencode(data).encode("utf-8")
req = urllib.request.Request(token_url, data=encoded_data, method="POST")
with urllib.request.urlopen(req, timeout=30) as response:
    access_token = json.loads(response.read().decode("utf-8"))["access_token"]

product_uuid = "3f5c4ba1-ed70-4065-91b9-2bbeb7ebfb79"

endpoints = [
    f"https://zipper.dataspace.copernicus.eu/odata/v1/Products({product_uuid})/$value",
    f"https://catalogue.dataspace.copernicus.eu/odata/v1/Products({product_uuid})/$value",
]

class NoRedirectHandler(urllib.request.HTTPRedirectHandler):
    def http_error_302(self, req, fp, code, msg, headers):
        return fp
    http_error_301 = http_error_302
    http_error_303 = http_error_302
    http_error_307 = http_error_302
    http_error_308 = http_error_302

for ep in endpoints:
    print(f"\nTesting endpoint: {ep}")
    try:
        d_req = urllib.request.Request(ep, method="GET")
        d_req.add_header("Authorization", f"Bearer {access_token}")
        # Test fetching only first 1024 bytes (Range)
        d_req.add_header("Range", "bytes=0-1023")
        with urllib.request.urlopen(d_req, timeout=30) as d_resp:
            print(f"Response Status: {d_resp.status}")
            print(f"Response URL: {d_resp.geturl()[:80]}...")
            headers = dict(d_resp.headers)
            print(f"Content-Type: {headers.get('Content-Type')}")
            print(f"Content-Length: {headers.get('Content-Length')}")
            sample = d_resp.read(100)
            print(f"Received sample bytes ({len(sample)} bytes): {sample[:20]}")
    except Exception as e:
        print(f"Endpoint test failed: {e}")
