import os
import sys
import json
import urllib.request
import urllib.parse
from pathlib import Path
from dotenv import dotenv_values

env_path = Path("services/backend-node/.env")
env_vars = dotenv_values(env_path)
username = env_vars.get("CDSE_USERNAME", "").strip()
password = env_vars.get("CDSE_PASSWORD", "").strip()

if not username or not password:
    print("STATUS: CDSE_AUTHENTICATION_REQUIRED")
    sys.exit(1)

# Authenticate with CDSE Keycloak
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

print("Authenticating with CDSE Keycloak...")
try:
    with urllib.request.urlopen(req, timeout=30) as response:
        resp_data = json.loads(response.read().decode("utf-8"))
except urllib.error.HTTPError as e:
    print(f"Authentication failed with HTTP error: {e.code} {e.reason}")
    print("STATUS: CDSE_AUTHENTICATION_REQUIRED")
    sys.exit(1)
except Exception as e:
    print(f"Authentication connection error: {e}")
    print("STATUS: CDSE_AUTHENTICATION_REQUIRED")
    sys.exit(1)

access_token = resp_data.get("access_token")
if not access_token:
    print("No access token received in payload")
    print("STATUS: CDSE_AUTHENTICATION_REQUIRED")
    sys.exit(1)

print("Authentication successful! Token acquired in-memory.")

product_uuid = "3f5c4ba1-ed70-4065-91b9-2bbeb7ebfb79"

# Query Product Metadata
product_url = f"https://catalogue.dataspace.copernicus.eu/odata/v1/Products({product_uuid})"
p_req = urllib.request.Request(product_url, method="GET")
p_req.add_header("Authorization", f"Bearer {access_token}")

try:
    with urllib.request.urlopen(p_req, timeout=30) as p_resp:
        meta = json.loads(p_resp.read().decode("utf-8"))
        print(f"Product metadata status: {p_resp.status}")
        print("Product Name:", meta.get("Name"))
        print("Product ContentLength:", meta.get("ContentLength"))
        print("Product OriginDate:", meta.get("OriginDate"))
except Exception as e:
    print(f"Error querying product metadata: {e}")

# Query Nodes to see child nodes
nodes_url = f"https://catalogue.dataspace.copernicus.eu/odata/v1/Products({product_uuid})/Nodes"
n_req = urllib.request.Request(nodes_url, method="GET")
n_req.add_header("Authorization", f"Bearer {access_token}")

try:
    with urllib.request.urlopen(n_req, timeout=30) as n_resp:
        nodes = json.loads(n_resp.read().decode("utf-8"))
        print(f"Product Nodes status: {n_resp.status}")
        print(f"Found {len(nodes.get('value', []))} top-level nodes:")
        for node in nodes.get("value", []):
            print(f" - {node.get('Name')} (Type: {node.get('NodeId')}, Length: {node.get('ContentLength')})")
except Exception as e:
    print(f"Error querying nodes: {e}")
