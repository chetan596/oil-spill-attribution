import os
import sys
from pathlib import Path
from dotenv import dotenv_values

env_path = Path("services/backend-node/.env")
if not env_path.exists():
    print("CDSE_USERNAME = MISSING")
    print("CDSE_PASSWORD = MISSING")
    sys.exit(1)

env_vars = dotenv_values(env_path)
u = env_vars.get("CDSE_USERNAME", "").strip()
p = env_vars.get("CDSE_PASSWORD", "").strip()

u_status = "DETECTED" if bool(u) else "MISSING"
p_status = "DETECTED" if bool(p) else "MISSING"

print(f"CDSE_USERNAME = {u_status}")
print(f"CDSE_PASSWORD = {p_status}")

if u_status != "DETECTED" or p_status != "DETECTED":
    print("FINAL_STATUS: CDSE_AUTHENTICATION_REQUIRED")
    sys.exit(1)
