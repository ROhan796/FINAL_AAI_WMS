#!/usr/bin/env python3
"""
Targeted upload for missing T3 devices (L2-L6)
10 devices x 100 records = 1,000 total records
"""

import random
import time
import requests
import os
import json
from datetime import datetime, timedelta, timezone
from typing import List, Dict, Any

API_URL = "https://api.nscbiairport.com/api/upload-json"
from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))
API_KEY = os.environ.get("NSCBI_API_KEY", "")
HEADERS = {"X-API-KEY": API_KEY, "Content-Type": "application/json"}

BATCH_SIZE = 50
DELAY_BETWEEN_UPLOADS = 0.2
DELAY_BETWEEN_BATCHES = 3
MAX_RETRIES = 3

# Missing T3 devices (L2-L6)
DEVICE_IDS = [
    "T3-L2-PPM-041", "T3-L2-PPF-042",
    "T3-L3-PPM-044", "T3-L3-PPF-045",
    "T3-L4-PPM-047", "T3-L4-PPF-048",
    "T3-L5-PPM-050", "T3-L5-PPF-051",
    "T3-L6-PPM-053", "T3-L6-PPF-054",
]

RANGES = {
    "PPM": {"temp": (23.0, 30.0), "hum": (50.0, 75.0), "nh3": (0.05, 40.0), "h2s": (0.01, 3.0), "occ": (0, 4)},
    "PPF": {"temp": (22.0, 28.0), "hum": (45.0, 70.0), "nh3": (0.02, 25.0), "h2s": (0.01, 2.0), "occ": (0, 4)},
}

def compute_penalties(temp, hum, nh3, h2s):
    p_nh3 = 0 if nh3 < 5 else (10 if nh3 < 15 else (25 if nh3 < 30 else 40))
    p_h2s = 0 if h2s < 0.5 else (10 if h2s < 1 else (20 if h2s < 2 else 35))
    p_hum = 0 if 40 <= hum <= 65 else (15 if hum < 30 or hum > 80 else 5)
    p_tmp = 0 if 22 <= temp <= 26 else (15 if temp > 32 else 5)
    whi = max(0, 100 - p_nh3 - p_h2s - p_hum - p_tmp)
    return p_nh3, p_h2s, p_hum, p_tmp, whi

def gen_record(device_id, timestamp):
    parts = device_id.split("-")
    r = RANGES[parts[2]]
    temp = round(random.uniform(*r["temp"]), 1)
    hum = round(random.uniform(*r["hum"]), 1)
    nh3 = round(random.uniform(*r["nh3"]), 2)
    h2s = round(random.uniform(*r["h2s"]), 2)
    occ = random.randint(*r["occ"])
    p_nh3, p_h2s, p_hum, p_tmp, whi = compute_penalties(temp, hum, nh3, h2s)
    return {
        "deviceId": device_id,
        "temperature": temp,
        "humidity": hum,
        "timestamp": timestamp.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "nh3": nh3, "h2s": h2s,
        "penalty_nh3": p_nh3, "penalty_h2s": p_h2s,
        "penalty_humidity": p_hum, "penalty_temperature": p_tmp,
        "raw_whi": whi,
        "throughput": int(occ * random.uniform(3, 6)),
        "occupancy_inside": occ,
    }

def gen_timestamps(n=100):
    now = datetime.now(timezone.utc)
    start = now - timedelta(days=7)
    step = (now - start) / n
    return [start + step * i for i in range(n)]

def upload_record(record):
    for attempt in range(MAX_RETRIES):
        try:
            resp = requests.post(API_URL, json=record, headers=HEADERS, timeout=30)
            if resp.status_code == 429:
                time.sleep(30 * (attempt + 1))
                continue
            if resp.status_code in (200, 201):
                return True, resp.status_code, resp.json().get("filename", ""), ""
            error_msg = ""
            try: error_msg = json.dumps(resp.json())
            except: error_msg = resp.text
            return False, resp.status_code, "", error_msg
        except Exception as e:
            time.sleep(5 * (attempt + 1))
    return False, 0, "", "Max retries exceeded"

def main():
    print("=" * 70)
    print("MISSING T3 DEVICES UPLOAD (L2-L6)")
    print("=" * 70)
    print(f"Devices: {len(DEVICE_IDS)}")
    print(f"Total records: {len(DEVICE_IDS) * 100}")
    print()

    all_records = []
    for device_id in DEVICE_IDS:
        for ts in gen_timestamps(100):
            all_records.append(gen_record(device_id, ts))

    print(f"Generated {len(all_records)} records")
    print()

    total_uploaded = 0
    total_failed = 0
    all_errors = []
    start_time = time.time()

    for batch_idx in range(0, len(all_records), BATCH_SIZE):
        batch = all_records[batch_idx:batch_idx + BATCH_SIZE]
        batch_num = (batch_idx // BATCH_SIZE) + 1

        for i, record in enumerate(batch):
            device_id = record["deviceId"]
            success, status_code, filename, error_msg = upload_record(record)
            if success:
                total_uploaded += 1
                print(f"  [{batch_num}] {i+1}/{len(batch)} OK: {device_id} -> {filename}")
            else:
                total_failed += 1
                all_errors.append({"device_id": device_id, "status_code": status_code, "error": error_msg})
                print(f"  [{batch_num}] {i+1}/{len(batch)} FAIL: {device_id} ({status_code})")
            time.sleep(DELAY_BETWEEN_UPLOADS)

        print(f"  Batch {batch_num} done | Total: {total_uploaded} OK, {total_failed} FAIL")
        if batch_idx + BATCH_SIZE < len(all_records):
            time.sleep(DELAY_BETWEEN_BATCHES)

    elapsed = time.time() - start_time
    print()
    print("=" * 70)
    print(f"COMPLETE: {total_uploaded} uploaded, {total_failed} failed in {elapsed:.0f}s")
    print("=" * 70)

    if all_errors:
        print("\nDA ENGINE ERROR REPORT:")
        for err in all_errors:
            print(f"  {err['device_id']}: HTTP {err['status_code']} - {err['error'][:100]}")
        with open(os.path.join(os.path.dirname(__file__), "upload_errors_missing_t3.json"), "w") as f:
            json.dump({"timestamp": datetime.now(timezone.utc).isoformat(), "errors": all_errors}, f, indent=2)

if __name__ == "__main__":
    main()
