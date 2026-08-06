#!/usr/bin/env python3
"""Upload data to PPD (Disabled) devices - expect possible errors"""
import random, time, requests, os, json
from datetime import datetime, timedelta, timezone

API_URL = "https://api.nscbiairport.com/api/upload-json"
load_dotenv = __import__('dotenv').load_dotenv
load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))
API_KEY = os.environ.get("NSCBI_API_KEY", "")
HEADERS = {"X-API-KEY": API_KEY, "Content-Type": "application/json"}

DEVICE_IDS = [
    "T2-L4-PPD-028", "T2-L5-PPD-031", "T2-L6-PPD-034",
    "T3-L1-PPD-037", "T3-L2-PPD-040", "T3-L3-PPD-043",
    "T3-L4-PPD-046", "T3-L5-PPD-049", "T3-L6-PPD-052",
]

results = {"success": [], "failed": []}

for did in DEVICE_IDS:
    now = datetime.now(timezone.utc)
    ts = now - timedelta(hours=1)
    temp = round(random.uniform(22.0, 27.0), 1)
    hum = round(random.uniform(40.0, 65.0), 1)
    nh3 = round(random.uniform(0.01, 15.0), 2)
    h2s = round(random.uniform(0.01, 1.5), 2)
    occ = random.randint(0, 2)
    
    rec = {
        "deviceId": did, "temperature": temp, "humidity": hum,
        "timestamp": ts.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "nh3": nh3, "h2s": h2s, "occupancy_inside": occ,
        "penalty_nh3": 0, "penalty_h2s": 0, "penalty_humidity": 0, "penalty_temperature": 0,
        "raw_whi": 100, "throughput": 0,
    }
    
    try:
        r = requests.post(API_URL, json=rec, headers=HEADERS, timeout=15)
        status = r.status_code
        try: body = r.json()
        except: body = r.text[:200]
        
        if status in (200, 201):
            results["success"].append({"device": did, "status": status, "filename": body.get("filename", "N/A")})
            print(f"OK   | {did} | HTTP {status} | {body.get('filename', 'N/A')}")
        else:
            results["failed"].append({"device": did, "status": status, "error": str(body)[:150]})
            print(f"FAIL | {did} | HTTP {status} | {str(body)[:150]}")
    except Exception as e:
        results["failed"].append({"device": did, "status": 0, "error": str(e)[:100]})
        print(f"ERR  | {did} | HTTP 0 | {str(e)[:100]}")
    
    time.sleep(0.5)

print(f"\n{'='*60}")
print(f"RESULTS: {len(results['success'])} OK, {len(results['failed'])} FAILED out of {len(DEVICE_IDS)}")
print(f"{'='*60}")

with open(os.path.join(os.path.dirname(__file__), "ppd_upload_results.json"), "w") as f:
    json.dump(results, f, indent=2)
print("Results saved to ppd_upload_results.json")
