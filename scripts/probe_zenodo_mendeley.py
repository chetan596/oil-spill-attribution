import urllib.request
import urllib.parse
import json
import ssl

ctx = ssl.create_default_context()
headers = {'User-Agent': 'OceanGuard-Acquisition-Tool/1.0'}

# 1. Search Zenodo
query = 'oil spill'
url = f"https://zenodo.org/api/records?q={urllib.parse.quote(query)}&size=10"
req = urllib.request.Request(url, headers=headers)
try:
    with urllib.request.urlopen(req, context=ctx, timeout=15) as resp:
        data = json.loads(resp.read().decode())
        hits = data.get('hits', {}).get('hits', [])
        print(f"Zenodo search hits: {len(hits)}")
        for h in hits:
            print(f"  ID: {h.get('id')} | Title: {h.get('metadata', {}).get('title')} | DOI: {h.get('metadata', {}).get('doi')}")
            for f in h.get('files', []):
                print(f"    - File: {f.get('key')} ({f.get('size')} bytes)")
except Exception as e:
    print("Zenodo search error:", e)

# 2. Check Mendeley direct download URL patterns
# For dataset 7kb7b273dr / 1:
# Mendeley Data standard download URL:
# https://data.mendeley.com/public-files/datasets/7kb7b273dr/files/...
# or https://data.mendeley.com/archived-datasets/7kb7b273dr/1
for m_url in [
    'https://data.mendeley.com/public-files/datasets/7kb7b273dr/1',
    'https://data.mendeley.com/datasets/7kb7b273dr/1/files',
    'https://api.mendeley.com/datasets/7kb7b273dr/1',
    'https://data.mendeley.com/datasets/7kb7b273dr/download'
]:
    try:
        req = urllib.request.Request(m_url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, context=ctx, timeout=10) as resp:
            print(f"Mendeley {m_url} -> Status: {resp.status}, Content-Type: {resp.headers.get('Content-Type')}, Size: {resp.headers.get('Content-Length')}")
    except Exception as e:
        print(f"Mendeley {m_url} -> Error: {e}")
