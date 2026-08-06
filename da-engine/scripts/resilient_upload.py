import requests, os, time, json
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))
API_KEY = os.environ.get("NSCBI_API_KEY", "")
API_URL = "https://api.nscbiairport.com/api"
HEADERS = {"X-API-KEY": API_KEY}

device_ids = [
    "T1-L1-PPD-001","T1-L1-PPM-002","T1-L1-PPF-003","T1-L2-PPD-004","T1-L2-PPM-005","T1-L2-PPF-006",
    "T1-L3-PPD-007","T1-L3-PPM-008","T1-L3-PPF-009","T1-L4-PPD-010","T1-L4-PPM-011","T1-L4-PPF-012",
    "T1-L5-PPD-013","T1-L5-PPM-014","T1-L5-PPF-015","T1-L6-PPD-016","T1-L6-PPM-017","T1-L6-PPF-018",
    "T2-L1-PPD-019","T2-L1-PPM-020","T2-L1-PPF-021","T2-L2-PPD-022","T2-L2-PPM-023","T2-L2-PPF-024",
    "T2-L3-PPD-025","T2-L3-PPM-026","T2-L3-PPF-027","T2-L4-PPD-028","T2-L4-PPM-029","T2-L4-PPF-030",
    "T2-L5-PPD-031","T2-L5-PPM-032","T2-L5-PPF-033","T2-L6-PPD-034","T2-L6-PPM-035","T2-L6-PPF-036",
    "T3-L1-PPD-037","T3-L1-PPM-038","T3-L1-PPF-039","T3-L2-PPD-040","T3-L2-PPM-041","T3-L2-PPF-042",
    "T3-L3-PPD-043","T3-L3-PPM-044","T3-L3-PPF-045","T3-L4-PPD-046","T3-L4-PPM-047","T3-L4-PPF-048",
    "T3-L5-PPD-049","T3-L5-PPM-050","T3-L5-PPF-051","T3-L6-PPD-052","T3-L6-PPM-053","T3-L6-PPF-054",
]

print("=" * 60)
print("Resilient Upload - 54 devices x 100 records = 5400 total")
print("=" * 60)

import random
random.seed(42)
from datetime import datetime, timedelta

all_records = []
for did in device_ids:
    parts = did.split("-")
    tid, fl = parts[0], parts[1]
    base_time = datetime(2026, 7, 15, 9, 0, 0)
    for i in range(100):
        ts = base_time + timedelta(hours=i * 1.5)
        nh3 = round(random.uniform(0.5, 35.0), 2)
        occ = random.randint(0, 4)
        whi = round(max(0, 100 - (nh3 / 50 * 100) - (occ * 5)), 1)
        all_records.append({
            "deviceId": did,
            "temperature": round(random.uniform(22.0, 29.0), 1),
            "humidity": round(random.uniform(40.0, 75.0), 1),
            "nh3": nh3,
            "h2s": round(random.uniform(0.1, 5.0), 2),
            "co2": round(random.uniform(400, 800), 1),
            "occupancy_inside": occ,
            "soap_pct": round(random.uniform(70, 100), 1),
            "paper_pct": round(random.uniform(70, 100), 1),
            "sanitizer_pct": round(random.uniform(70, 100), 1),
            "cleanliness_score": round(random.uniform(60, 95), 1),
            "raw_whi": whi,
            "battery": round(random.uniform(60, 100), 1),
            "rssi": round(random.uniform(-70, -45), 1),
            "penalty_nh3": 0, "penalty_h2s": 0, "penalty_humidity": 0, "penalty_temperature": 0,
            "throughput": round(occ * 4.5, 1),
            "timestamp": ts.strftime("%Y-%m-%dT%H:%M:%SZ"),
        })

print(f"Generated {len(all_records)} records")

uploaded = 0
failed = 0
max_retries = 3

for i, rec in enumerate(all_records):
    success = False
    for attempt in range(max_retries):
        try:
            r = requests.post(f"{API_URL}/upload-json", headers=HEADERS, json=rec, timeout=15)
            if r.status_code in (200, 201):
                uploaded += 1
                success = True
                break
            elif r.status_code == 429:
                wait = 10 * (attempt + 1)
                print(f"  Rate limited at record {i+1}, waiting {wait}s...")
                time.sleep(wait)
            else:
                print(f"  Record {i+1}: HTTP {r.status_code}")
                time.sleep(1)
        except Exception as e:
            wait = 5 * (attempt + 1)
            print(f"  Record {i+1}: Error ({attempt+1}/{max_retries}), retrying in {wait}s...")
            time.sleep(wait)

    if not success:
        failed += 1

    if (i + 1) % 100 == 0:
        print(f"Progress: {i+1}/{len(all_records)} | Uploaded: {uploaded} | Failed: {failed}")

print(f"\n{'=' * 60}")
print(f"DONE: {uploaded} uploaded, {failed} failed out of {len(all_records)} total")
print(f"{'=' * 60}")
