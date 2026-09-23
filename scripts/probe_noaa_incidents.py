import urllib.request
import re
import json

headers = {'User-Agent': 'Mozilla/5.0'}

# Search IncidentNews for incidents with photos or search for incidents
# Incident search: https://incidentnews.noaa.gov/search?q=oil&type=incident
url = 'https://incidentnews.noaa.gov/search?q=oil'
try:
    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req, timeout=15) as resp:
        html = resp.read().decode('utf-8', errors='ignore')
        incidents = re.findall(r'href="(/incident/(\d+))"[^>]*>([^<]+)</a>', html)
        print(f"Found {len(incidents)} incidents from search:")
        for path, inc_id, title in incidents[:10]:
            print(f"  Incident {inc_id}: {title.strip()}")
            # check incident details page
            inc_url = f"https://incidentnews.noaa.gov/incident/{inc_id}"
            req_inc = urllib.request.Request(inc_url, headers=headers)
            with urllib.request.urlopen(req_inc, timeout=10) as r_inc:
                inc_page = r_inc.read().decode('utf-8', errors='ignore')
                # check if has photos tab or photo links
                photos = re.findall(r'href="(/incident/' + inc_id + r'/photos)"|src="(/attachments/[^"]+)"|src="([^"]+noaa[^"]+\.jpg)"', inc_page)
                print(f"    Photos matches: {photos}")
except Exception as e:
    print("NOAA IncidentNews search error:", e)
