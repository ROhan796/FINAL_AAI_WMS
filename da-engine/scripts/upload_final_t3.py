#!/usr/bin/env python3
"""Final upload for remaining T3 devices (L5-PPF, L6)"""
import random, time, requests, os, json
from datetime import datetime, timedelta, timezone

API_URL = "https://api.nscbiairport.com/api/upload-json"
load_dotenv = __import__('dotenv').load_dotenv
load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))
API_KEY = os.environ.get("NSCBI_API_KEY", "")
HEADERS = {"X-API-KEY": API_KEY, "Content-Type": "application/json"}

DEVICE_IDS = ["T3-L5-PPF-051", "T3-L6-PPM-053", "T3-L6-PPF-054"]
RANGES = {
    "PPM": {"temp": (23.0, 30.0), "hum": (50.0, 75.0), "nh3": (0.05, 40.0), "h2s": (0.01, 3.0), "occ": (0, 4)},
    "PPF": {"temp": (22.0, 28.0), "hum": (45.0, 70.0), "nh3": (0.02, 25.0), "h2s": (0.01, 2.0), "occ": (0, 4)},
}

def gen_record(did, ts):
    r = RANGES[did.split("-")[2]]
    temp = round(random.uniform(*r["temp"]), 1)
    hum = round(random.uniform(*r["hum"]), 1)
    nh3 = round(random.uniform(*r["nh3"]), 2)
    h2s = round(random.uniform(*r["h2s"]), 2)
    occ = random.randint(*r["occ"])
    p_nh3 = 0 if nh3 < 5 else (10 if nh3 < 15 else (25 if nh3 < 30 else 40))
    p_h2s = 0 if h2s < 0.5 else (10 if h2s < 1 else (20 if h2s < 2 else 35))
    p_hum = 0 if 40 <= hum <= 65 else (15 if hum < 30 or hum > 80 else 5)
    p_tmp = 0 if 22 <= temp <= 26 else (15 if temp > 32 else 5)
    return {"deviceId": did, "temperature": temp, "humidity": hum, "timestamp": ts.strftime("%Y-%m-%dT%H:%M:%SZ"),
            "nh3": nh3, "h2s": h2s, "penalty_nh3": p_nh3, "penalty_h2s": p_h2s,
            "penalty_humidity": p_hum, "penalty_temperature": p_tmp, "raw_whi": max(0, 100-p_nh3-p_h2s-p_hum-p_tmp),
            "throughput": int(occ * random.uniform(3, 6)), "occupancy_inside": occ}

uploaded = 0
failed = 0
for did in DEVICE_IDS:
    now = datetime.now(timezone.utc)
    start = now - timedelta(days=7)
    step = (now - start) / 100
    for i in range(100):
        ts = start + step * i
        rec = gen_record(did, ts)
        for attempt in range(3):
            try:
                r = requests.post(API_URL, json=rec, headers=HEADERS, timeout=30)
                if r.status_code in (200, 201):
                    uploaded += 1
                    print(f"OK: {did} ({uploaded})")
                    break
                elif r.status_code == 429:
                    time.sleep(30)
                else:
                    failed += 1
                    print(f"FAIL: {did} ({r.status_code})")
                    break
            except:
                time.sleep(5)
        time.sleep(0.2)

print(f"\nDONE: {uploaded} uploaded, {failed} failed")
