import urllib.request
import json
import re
import ssl

ctx = ssl.create_default_context()
headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
}

# 1. Mendeley Data for LADOS (7kb7b273dr)
for dataset_id in ['7kb7b273dr', '8987b74w94']:
    try:
        url = f'https://data.mendeley.com/api/datasets/{dataset_id}'
        req = urllib.request.Request(url, headers=headers)
        with urllib.request.urlopen(req, context=ctx, timeout=10) as resp:
            data = json.loads(resp.read().decode())
            print(f'Mendeley ({dataset_id}) title:', data.get('name') or data.get('title'))
            files = data.get('files', [])
            print(f'Mendeley ({dataset_id}) files count: {len(files)}')
            for f in files[:5]:
                print('  -', f.get('filename'), f.get('size'), 'bytes', f.get('downloadUrl'))
    except Exception as e:
        print(f'Mendeley probe ({dataset_id}) error:', e)

# Also check Mendeley public direct download URL format
# https://data.mendeley.com/public-files/datasets/7kb7b273dr/files/...
try:
    url = 'https://data.mendeley.com/datasets/7kb7b273dr/1'
    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req, context=ctx, timeout=10) as resp:
        html = resp.read().decode('utf-8', errors='ignore')
        print('LADOS page fetched, length:', len(html))
        # find download links
        links = re.findall(r'href="([^"]+download[^"]+)"', html)
        print('LADOS download links found:', links[:5])
except Exception as e:
    print('LADOS page fetch error:', e)

# 2. Kerf dataset probe
# Scientific Data paper: https://doi.org/10.1038/s41597-024-03993-8
try:
    url = 'https://doi.org/10.1038/s41597-024-03993-8'
    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req, context=ctx, timeout=10) as resp:
        html = resp.read().decode('utf-8', errors='ignore')
        print('Kerf paper page fetched, length:', len(html))
        zenodo_links = re.findall(r'https?://zenodo\.org/records/\d+|https?://doi\.org/10\.5281/zenodo\.\d+', html)
        print('Kerf zenodo links:', set(zenodo_links))
        osf_links = re.findall(r'https?://osf\.io/[a-zA-Z0-9]+', html)
        print('Kerf OSF links:', set(osf_links))
        github_links = re.findall(r'https?://github\.com/[a-zA-Z0-9_-]+/[a-zA-Z0-9_-]+', html)
        print('Kerf Github links:', set(github_links))
except Exception as e:
    print('Kerf paper fetch error:', e)

# 3. NOAA IncidentNews & NOAA OR&R probe
try:
    url = 'https://incidentnews.noaa.gov/incident'
    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req, context=ctx, timeout=10) as resp:
        html = resp.read().decode('utf-8', errors='ignore')
        print('IncidentNews search page fetched, length:', len(html))
        incident_links = re.findall(r'/incident/\d+', html)
        print('Sample incident links:', incident_links[:10])
except Exception as e:
    print('NOAA IncidentNews error:', e)
