#!/usr/bin/env python3
"""
NSCBI Airport — Batch Upload for T2 & T3 Devices (PPM & PPF only)
24 Devices × 100 records = 2,400 total records
Uploads to POST /api/upload-json with rate limiting and error reporting
"""

import random
import time
import requests
import os
import json
from datetime import datetime, timedelta, timezone
from typing import List, Dict, Any

# ═══════════════════════════════════════════════════════════════
# CONFIGURATION
# ═══════════════════════════════════════════════════════════════

API_URL = "https://api.nscbiairport.com/api/upload-json"
from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))
API_KEY = os.environ.get("NSCBI_API_KEY", "")
HEADERS = {
    "X-API-KEY": API_KEY,
    "Content-Type": "application/json"
}

BATCH_SIZE = 50
DELAY_BETWEEN_UPLOADS = 0.2
DELAY_BETWEEN_BATCHES = 3
RETRY_DELAY_429 = 30
MAX_RETRIES = 3

# ═══════════════════════════════════════════════════════════════
# 24 DEVICE IDs (T2 & T3 — PPM & PPF only)
# ═══════════════════════════════════════════════════════════════

DEVICE_IDS = [
    # Terminal 2 (T2) — PPM & PPF
    "T2-L1-PPM-020", "T2-L1-PPF-021",
    "T2-L2-PPM-023", "T2-L2-PPF-024",
    "T2-L3-PPM-026", "T2-L3-PPF-027",
    "T2-L4-PPM-029", "T2-L4-PPF-030",
    "T2-L5-PPM-032", "T2-L5-PPF-033",
    "T2-L6-PPM-035", "T2-L6-PPF-036",
    # Terminal 3 (T3) — PPM & PPF
    "T3-L1-PPM-038", "T3-L1-PPF-039",
    "T3-L2-PPM-041", "T3-L2-PPF-042",
    "T3-L3-PPM-044", "T3-L3-PPF-045",
    "T3-L4-PPM-047", "T3-L4-PPF-048",
    "T3-L5-PPM-050", "T3-L5-PPF-051",
    "T3-L6-PPM-053", "T3-L6-PPF-054",
]

# ═══════════════════════════════════════════════════════════════
# SENSOR RANGES PER DEVICE TYPE
# ═══════════════════════════════════════════════════════════════

RANGES = {
    "PPM": {
        "temp": (23.0, 30.0),
        "hum": (50.0, 75.0),
        "nh3": (0.05, 40.0),
        "h2s": (0.01, 3.0),
        "occ": (0, 4),
    },
    "PPF": {
        "temp": (22.0, 28.0),
        "hum": (45.0, 70.0),
        "nh3": (0.02, 25.0),
        "h2s": (0.01, 2.0),
        "occ": (0, 4),
    },
}

# ═══════════════════════════════════════════════════════════════
# PENALTY CALCULATION FORMULAS
# ═══════════════════════════════════════════════════════════════

def compute_penalties(temp: float, hum: float, nh3: float, h2s: float) -> tuple:
    if nh3 < 5:
        p_nh3 = 0
    elif nh3 < 15:
        p_nh3 = 10
    elif nh3 < 30:
        p_nh3 = 25
    else:
        p_nh3 = 40

    if h2s < 0.5:
        p_h2s = 0
    elif h2s < 1:
        p_h2s = 10
    elif h2s < 2:
        p_h2s = 20
    else:
        p_h2s = 35

    if 40 <= hum <= 65:
        p_hum = 0
    elif hum < 30 or hum > 80:
        p_hum = 15
    else:
        p_hum = 5

    if 22 <= temp <= 26:
        p_tmp = 0
    elif temp > 32:
        p_tmp = 15
    else:
        p_tmp = 5

    whi = max(0, 100 - p_nh3 - p_h2s - p_hum - p_tmp)
    return p_nh3, p_h2s, p_hum, p_tmp, whi

# ═══════════════════════════════════════════════════════════════
# RECORD GENERATION
# ═══════════════════════════════════════════════════════════════

def gen_record(device_id: str, timestamp: datetime) -> Dict[str, Any]:
    parts = device_id.split("-")
    dev_type = parts[2]
    r = RANGES[dev_type]

    temp = round(random.uniform(*r["temp"]), 1)
    hum = round(random.uniform(*r["hum"]), 1)
    nh3 = round(random.uniform(*r["nh3"]), 2)
    h2s = round(random.uniform(*r["h2s"]), 2)
    occ = random.randint(*r["occ"])

    p_nh3, p_h2s, p_hum, p_tmp, whi = compute_penalties(temp, hum, nh3, h2s)
    tput = int(occ * random.uniform(3, 6))

    return {
        "deviceId": device_id,
        "temperature": temp,
        "humidity": hum,
        "timestamp": timestamp.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "nh3": nh3,
        "h2s": h2s,
        "penalty_nh3": p_nh3,
        "penalty_h2s": p_h2s,
        "penalty_humidity": p_hum,
        "penalty_temperature": p_tmp,
        "raw_whi": whi,
        "throughput": tput,
        "occupancy_inside": occ,
    }

def gen_timestamps(n: int = 100) -> List[datetime]:
    now = datetime.now(timezone.utc)
    start = now - timedelta(days=7)
    step = (now - start) / n
    return [start + step * i for i in range(n)]

def build_all_records() -> List[Dict[str, Any]]:
    all_records = []
    for device_id in DEVICE_IDS:
        timestamps = gen_timestamps(100)
        for ts in timestamps:
            record = gen_record(device_id, ts)
            all_records.append(record)
    return all_records

# ═══════════════════════════════════════════════════════════════
# UPLOAD LOGIC
# ═══════════════════════════════════════════════════════════════

def upload_record(record: Dict[str, Any]) -> tuple:
    for attempt in range(MAX_RETRIES):
        try:
            resp = requests.post(API_URL, json=record, headers=HEADERS, timeout=30)

            if resp.status_code == 429:
                wait = RETRY_DELAY_429 * (attempt + 1)
                print(f"  Rate limited (429). Waiting {wait}s...")
                time.sleep(wait)
                continue

            if resp.status_code in (200, 201):
                data = resp.json()
                filename = data.get("filename", "unknown")
                return True, resp.status_code, filename, ""
            else:
                error_msg = ""
                try:
                    error_data = resp.json()
                    error_msg = json.dumps(error_data)
                except:
                    error_msg = resp.text
                return False, resp.status_code, "", error_msg

        except requests.exceptions.ConnectionError as e:
            wait = 5 * (attempt + 1)
            print(f"  Connection error (attempt {attempt+1}/{MAX_RETRIES}), retrying in {wait}s...")
            time.sleep(wait)
        except requests.exceptions.Timeout:
            wait = 5 * (attempt + 1)
            print(f"  Timeout (attempt {attempt+1}/{MAX_RETRIES}), retrying in {wait}s...")
            time.sleep(wait)
        except Exception as e:
            return False, 0, "", str(e)

    return False, 0, "", "Max retries exceeded"

def upload_batch(batch: List[Dict[str, Any]], batch_num: int) -> tuple:
    uploaded = 0
    failed = 0
    errors = []

    for i, record in enumerate(batch):
        device_id = record["deviceId"]
        success, status_code, filename, error_msg = upload_record(record)

        if success:
            uploaded += 1
            print(f"  [{batch_num}] {i+1}/{len(batch)} OK: {device_id} -> {filename}")
        else:
            failed += 1
            errors.append({
                "device_id": device_id,
                "status_code": status_code,
                "error": error_msg
            })
            print(f"  [{batch_num}] {i+1}/{len(batch)} FAIL: {device_id} ({status_code}) - {error_msg}")

        time.sleep(DELAY_BETWEEN_UPLOADS)

    return uploaded, failed, errors

# ═══════════════════════════════════════════════════════════════
# MAIN EXECUTION
# ═══════════════════════════════════════════════════════════════

def main():
    print("=" * 70)
    print("NSCBI Airport — T2 & T3 Batch Upload (PPM & PPF only)")
    print("=" * 70)
    print(f"Devices: {len(DEVICE_IDS)}")
    print(f"Records per device: 100")
    print(f"Total records: {len(DEVICE_IDS) * 100}")
    print(f"Batch size: {BATCH_SIZE}")
    print(f"API URL: {API_URL}")
    print()

    print("Device IDs:")
    for did in DEVICE_IDS:
        print(f"  - {did}")
    print()

    print("Generating 2,400 records...")
    all_records = build_all_records()
    print(f"Generated {len(all_records)} records")
    print()

    total_uploaded = 0
    total_failed = 0
    all_errors = []
    start_time = time.time()

    print("Starting upload...")
    print("-" * 70)

    for batch_idx in range(0, len(all_records), BATCH_SIZE):
        batch = all_records[batch_idx:batch_idx + BATCH_SIZE]
        batch_num = (batch_idx // BATCH_SIZE) + 1

        print(f"\nBatch {batch_num} ({len(batch)} records):")
        uploaded, failed, errors = upload_batch(batch, batch_num)

        total_uploaded += uploaded
        total_failed += failed
        all_errors.extend(errors)

        print(f"  Batch {batch_num} complete: +{uploaded} uploaded, +{failed} failed")
        print(f"  Running total: {total_uploaded} uploaded, {total_failed} failed")

        if batch_idx + BATCH_SIZE < len(all_records):
            print(f"  Cooling down {DELAY_BETWEEN_BATCHES}s...")
            time.sleep(DELAY_BETWEEN_BATCHES)

    elapsed = time.time() - start_time
    print()
    print("=" * 70)
    print("UPLOAD COMPLETE")
    print("=" * 70)
    print(f"Total uploaded: {total_uploaded}")
    print(f"Total failed: {total_failed}")
    print(f"Time elapsed: {elapsed:.1f}s ({elapsed/60:.1f} min)")
    if total_uploaded + total_failed > 0:
        print(f"Success rate: {total_uploaded/(total_uploaded+total_failed)*100:.1f}%")
    print("=" * 70)

    if all_errors:
        print()
        print("=" * 70)
        print("DA ENGINE ERROR REPORT")
        print("=" * 70)
        print(f"Total errors: {len(all_errors)}")
        print()

        error_summary = {}
        for err in all_errors:
            status = err["status_code"]
            if status not in error_summary:
                error_summary[status] = {"count": 0, "devices": [], "sample_error": ""}
            error_summary[status]["count"] += 1
            error_summary[status]["devices"].append(err["device_id"])
            if not error_summary[status]["sample_error"]:
                error_summary[status]["sample_error"] = err["error"]

        for status, info in sorted(error_summary.items()):
            print(f"HTTP {status}: {info['count']} errors")
            print(f"  Devices: {', '.join(info['devices'][:5])}{'...' if len(info['devices']) > 5 else ''}")
            if info['sample_error']:
                print(f"  Sample error: {info['sample_error'][:200]}")
            print()

        error_log_path = os.path.join(os.path.dirname(__file__), "upload_errors_t2t3.json")
        with open(error_log_path, "w") as f:
            json.dump({
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "total_uploaded": total_uploaded,
                "total_failed": total_failed,
                "errors": all_errors
            }, f, indent=2)
        print(f"Error log saved to: {error_log_path}")

if __name__ == "__main__":
    main()
