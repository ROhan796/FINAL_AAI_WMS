import requests
import os
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

API_KEY = os.environ.get("NSCBI_API_KEY", "")
API_URL = "https://api.nscbiairport.com/api"
headers = {"X-API-KEY": API_KEY}

r = requests.get(f"{API_URL}/list-files", headers=headers, params={"limit": 2000}, timeout=30)
print(f"Status: {r.status_code}")
try:
    data = r.json()
    files = data.get("files", [])
    print(f"Total files in API: {len(files)}")
except Exception as e:
    print(f"Response: {r.text[:500]}")
