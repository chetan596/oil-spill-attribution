import urllib.request
import json
import ssl
import re

ctx = ssl.create_default_context()
headers = {
    'User-Agent': 'OceanGuard-Acquisition-Tool/1.0 (academic research; contact@oceanguard.org)'
}

# 1. Kerf Zenodo record: 10555314
print("=== 1. KERF ZENODO RECORD (10555314) ===")
try:
    req = urllib.request.Request('https://zenodo.org/api/records/10555314', headers=headers)
    with urllib.request.urlopen(req, context=ctx, timeout=15) as resp:
        data = json.loads(resp.read().decode())
        meta = data.get('metadata', {})
        print("Title:", meta.get('title'))
        print("DOI:", meta.get('doi'))
        print("License:", meta.get('license'))
        print("Description preview:", meta.get('description', '')[:200])
        files = data.get('files', [])
        print(f"Files count: {len(files)}")
        for f in files:
            print("  - File:", f.get('key'), "Size:", f.get('size'), "bytes", "Link:", f.get('links', {}).get('self'))
except Exception as e:
    print("Kerf Zenodo error:", e)

# 2. MADOS Zenodo record: 10664073
print("\n=== 2. MADOS ZENODO RECORD (10664073) ===")
try:
    req = urllib.request.Request('https://zenodo.org/api/records/10664073', headers=headers)
    with urllib.request.urlopen(req, context=ctx, timeout=15) as resp:
        data = json.loads(resp.read().decode())
        meta = data.get('metadata', {})
        print("Title:", meta.get('title'))
        print("DOI:", meta.get('doi'))
        print("License:", meta.get('license'))
        files = data.get('files', [])
        print(f"Files count: {len(files)}")
        for f in files:
            print("  - File:", f.get('key'), "Size:", f.get('size'), "bytes", "Link:", f.get('links', {}).get('self'))
except Exception as e:
    print("MADOS Zenodo error:", e)

# 3. LADOS Mendeley probe
print("\n=== 3. LADOS MENDELEY DATA ===")
# Mendeley Data URL: https://data.mendeley.com/datasets/7kb7b273dr/1
# Mendeley public files direct download: https://data.mendeley.com/public-files/datasets/7kb7b273dr/files/...
try:
    req = urllib.request.Request('https://data.mendeley.com/api/datasets/7kb7b273dr?version=1', headers={'User-Agent': 'Mozilla/5.0'})
    with urllib.request.urlopen(req, context=ctx, timeout=15) as resp:
        data = json.loads(resp.read().decode())
        print("Mendeley title:", data.get('name'))
        print("Mendeley DOI:", data.get('doi'))
        print("Mendeley license:", data.get('license'))
        print("Mendeley files count:", len(data.get('files', [])))
        for f in data.get('files', []):
            print("  - File:", f.get('filename'), "Size:", f.get('size'), "Download URL:", f.get('downloadUrl'))
except Exception as e:
    print("Mendeley direct error:", e)

# 4. NOAA IncidentNews & OR&R probe
print("\n=== 4. NOAA INCIDENTNEWS & OR&R ===")
for url in [
    'https://incidentnews.noaa.gov/',
    'https://response.restoration.noaa.gov/oil-and-chemical-spills/oil-spills/resources/images',
    'https://response.restoration.noaa.gov/about/media/photo-gallery.html'
]:
    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, context=ctx, timeout=10) as resp:
            html = resp.read().decode('utf-8', errors='ignore')
            print(f"NOAA url {url} fetched: {len(html)} bytes")
            # look for image links or incident links
            jpgs = re.findall(r'href="([^"]+\.jpg)"|src="([^"]+\.jpg)"', html)
            print(f"  jpg count found: {len(jpgs)}")
    except Exception as e:
        print(f"NOAA url {url} error: {e}")
