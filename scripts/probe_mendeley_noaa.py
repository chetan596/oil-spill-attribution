import urllib.request
import json
import ssl
import re

ctx = ssl.create_default_context()
headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
}

# 1. Inspect Mendeley Data page for LADOS (7kb7b273dr)
url = 'https://data.mendeley.com/datasets/7kb7b273dr/1'
try:
    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req, context=ctx, timeout=15) as resp:
        html = resp.read().decode('utf-8', errors='ignore')
        print("LADOS Mendeley HTML len:", len(html))
        # Look for S3 links or direct file links or JSON data embedded in <script> tags
        json_scripts = re.findall(r'<script[^>]*>(.*?)</script>', html, re.DOTALL)
        for s in json_scripts:
            if '7kb7b273dr' in s or 'download' in s or 'directDownloadUrl' in s:
                print("Found relevant script block (len", len(s), "):", s[:300])
                # search for download urls
                dls = re.findall(r'https://[^\s"\']+\.zip|https://[^\s"\']+download[^\s"\']+', s)
                print("Zip/download links in script:", dls)
except Exception as e:
    print("Mendeley page parse error:", e)

# 2. Inspect NOAA IncidentNews
# URL structure for IncidentNews
try:
    req = urllib.request.Request('https://incidentnews.noaa.gov/', headers=headers)
    with urllib.request.urlopen(req, context=ctx, timeout=15) as resp:
        html = resp.read().decode('utf-8', errors='ignore')
        # find incident links
        links = re.findall(r'href="(/incident/\d+)"', html)
        print("IncidentNews incident links:", set(links[:15]))
        # Let's inspect one incident page
        if links:
            inc_url = 'https://incidentnews.noaa.gov' + links[0]
            req2 = urllib.request.Request(inc_url, headers=headers)
            with urllib.request.urlopen(req2, context=ctx, timeout=15) as resp2:
                inc_html = resp2.read().decode('utf-8', errors='ignore')
                imgs = re.findall(r'src="([^"]+photos[^"]+)"|href="([^"]+photos[^"]+)"|src="([^"]+\.jpg)"', inc_html)
                print(f"Incident {links[0]} photos/images:", imgs[:5])
                # look for photos tab
                photo_tabs = re.findall(r'href="([^"]*photo[^"]*)"', inc_html)
                print(f"Incident {links[0]} photo tab links:", photo_tabs)
except Exception as e:
    print("NOAA IncidentNews error:", e)
