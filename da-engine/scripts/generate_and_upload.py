#!/usr/bin/env python3
"""
NSCBI Airport — 54-Device Data Generator & Uploader
Generates 5,400 JSON records (54 devices × 100 records each)
Uploads to POST /api/upload-json with proper rate limiting
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
load_dotenv()
API_KEY = os.environ.get("NSCBI_API_KEY", "")
HEADERS = {
    "X-API-KEY": API_KEY,
    "Content-Type": "application/json"
}

BATCH_SIZE = 50
DELAY_BETWEEN_UPLOADS = 0.2  # seconds
DELAY_BETWEEN_BATCHES = 3    # seconds
RETRY_DELAY_429 = 30         # seconds

# ═══════════════════════════════════════════════════════════════
# 54 DEVICE IDs (FIXED - DO NOT MODIFY)
# ═══════════════════════════════════════════════════════════════

DEVICE_IDS = [
    # Terminal 1 (T1)
    "T1-L1-PPD-001", "T1-L1-PPM-002", "T1-L1-PPF-003",
    "T1-L2-PPD-004", "T1-L2-PPM-005", "T1-L2-PPF-006",
    "T1-L3-PPD-007", "T1-L3-PPM-008", "T1-L3-PPF-009",
    "T1-L4-PPD-010", "T1-L4-PPM-011", "T1-L4-PPF-012",
    "T1-L5-PPD-013", "T1-L5-PPM-014", "T1-L5-PPF-015",
    "T1-L6-PPD-016", "T1-L6-PPM-017", "T1-L6-PPF-018",
    # Terminal 2 (T2)
    "T2-L1-PPD-019", "T2-L1-PPM-020", "T2-L1-PPF-021",
    "T2-L2-PPD-022", "T2-L2-PPM-023", "T2-L2-PPF-024",
    "T2-L3-PPD-025", "T2-L3-PPM-026", "T2-L3-PPF-027",
    "T2-L4-PPD-028", "T2-L4-PPM-029", "T2-L4-PPF-030",
    "T2-L5-PPD-031", "T2-L5-PPM-032", "T2-L5-PPF-033",
    "T2-L6-PPD-034", "T2-L6-PPM-035", "T2-L6-PPF-036",
    # Terminal 3 (T3)
    "T3-L1-PPD-037", "T3-L1-PPM-038", "T3-L1-PPF-039",
    "T3-L2-PPD-040", "T3-L2-PPM-041", "T3-L2-PPF-042",
    "T3-L3-PPD-043", "T3-L3-PPM-044", "T3-L3-PPF-045",
    "T3-L4-PPD-046", "T3-L4-PPM-047", "T3-L4-PPF-048",
    "T3-L5-PPD-049", "T3-L5-PPM-050", "T3-L5-PPF-051",
    "T3-L6-PPD-052", "T3-L6-PPM-053", "T3-L6-PPF-054",
]

# ═══════════════════════════════════════════════════════════════
# SENSOR RANGES PER DEVICE TYPE
# ═══════════════════════════════════════════════════════════════

RANGES = {
    "PPD": {
        "temp": (22.0, 27.0),
        "hum": (40.0, 65.0),
        "nh3": (0.01, 15.0),
        "h2s": (0.01, 1.5),
        "occ": (0, 2),
    },
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
    """
    Calculate penalty points for each sensor reading.
    Returns: (penalty_nh3, penalty_h2s, penalty_humidity, penalty_temperature, raw_whi)
    """
    # NH3 Penalty
    if nh3 < 5:
        p_nh3 = 0
    elif nh3 < 15:
        p_nh3 = 10
    elif nh3 < 30:
        p_nh3 = 25
    else:
        p_nh3 = 40

    # H2S Penalty
    if h2s < 0.5:
        p_h2s = 0
    elif h2s < 1:
        p_h2s = 10
    elif h2s < 2:
        p_h2s = 20
    else:
        p_h2s = 35

    # Humidity Penalty
    if 40 <= hum <= 65:
        p_hum = 0
    elif hum < 30 or hum > 80:
        p_hum = 15
    else:
        p_hum = 5

    # Temperature Penalty
    if 22 <= temp <= 26:
        p_tmp = 0
    elif temp > 32:
        p_tmp = 15
    else:
        p_tmp = 5

    # Raw WHI
    whi = max(0, 100 - p_nh3 - p_h2s - p_hum - p_tmp)

    return p_nh3, p_h2s, p_hum, p_tmp, whi

# ═══════════════════════════════════════════════════════════════
# RECORD GENERATION
# ═══════════════════════════════════════════════════════════════

def gen_record(device_id: str, timestamp: datetime) -> Dict[str, Any]:
    """Generate a single sensor record for a device at a given timestamp"""
    # Parse device type from ID
    parts = device_id.split("-")
    dev_type = parts[2]  # PPD, PPM, or PPF

    # Get ranges for this device type
    r = RANGES[dev_type]

    # Generate random sensor values
    temp = round(random.uniform(*r["temp"]), 1)
    hum = round(random.uniform(*r["hum"]), 1)
    nh3 = round(random.uniform(*r["nh3"]), 2)
    h2s = round(random.uniform(*r["h2s"]), 2)
    occ = random.randint(*r["occ"])

    # Calculate penalties and WHI
    p_nh3, p_h2s, p_hum, p_tmp, whi = compute_penalties(temp, hum, nh3, h2s)

    # Derive throughput from occupancy
    tput = int(occ * random.uniform(3, 6))

    # Build record (EXACT schema - no _received_at)
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
    """Generate n timestamps spread evenly across the past 7 days"""
    now = datetime.now(timezone.utc)
    start = now - timedelta(days=7)
    step = (now - start) / n
    return [start + step * i for i in range(n)]

def build_all_records() -> List[Dict[str, Any]]:
    """Generate all 5,400 records (54 devices × 100 records each)"""
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
    """
    Upload a single record to the API.
    Returns: (success: bool, status_code: int, filename: str)
    """
    try:
        resp = requests.post(API_URL, json=record, headers=HEADERS, timeout=30)

        if resp.status_code == 429:
            # Rate limited - wait and retry
            print(f"  Rate limited (429). Waiting {RETRY_DELAY_429}s...")
            time.sleep(RETRY_DELAY_429)
            resp = requests.post(API_URL, json=record, headers=HEADERS, timeout=30)

        if resp.status_code in (200, 201):
            data = resp.json()
            filename = data.get("filename", "unknown")
            return True, resp.status_code, filename
        else:
            return False, resp.status_code, ""

    except Exception as e:
        print(f"  Error: {e}")
        return False, 0, ""

def upload_batch(batch: List[Dict[str, Any]], batch_num: int) -> tuple:
    """
    Upload a batch of records with rate limiting.
    Returns: (uploaded_count, failed_count)
    """
    uploaded = 0
    failed = 0

    for i, record in enumerate(batch):
        device_id = record["deviceId"]
        success, status_code, filename = upload_record(record)

        if success:
            uploaded += 1
            print(f"  [{batch_num}] {i+1}/{len(batch)} OK: {device_id} -> {filename}")
        else:
            failed += 1
            print(f"  [{batch_num}] {i+1}/{len(batch)} FAIL: {device_id} ({status_code})")

        # Rate limit between individual uploads
        time.sleep(DELAY_BETWEEN_UPLOADS)

    return uploaded, failed

# ═══════════════════════════════════════════════════════════════
# MAIN EXECUTION
# ═══════════════════════════════════════════════════════════════

def main():
    print("=" * 60)
    print("NSCBI Airport — 54-Device Data Generator & Uploader")
    print("=" * 60)
    print(f"Devices: {len(DEVICE_IDS)}")
    print(f"Records per device: 100")
    print(f"Total records: {len(DEVICE_IDS) * 100}")
    print(f"Batch size: {BATCH_SIZE}")
    print(f"API URL: {API_URL}")
    print()

    # Generate all records
    print("Generating 5,400 records...")
    all_records = build_all_records()
    print(f"Generated {len(all_records)} records")
    print()

    # Upload in batches
    total_uploaded = 0
    total_failed = 0
    start_time = time.time()

    print("Starting upload...")
    print("-" * 60)

    for batch_idx in range(0, len(all_records), BATCH_SIZE):
        batch = all_records[batch_idx:batch_idx + BATCH_SIZE]
        batch_num = (batch_idx // BATCH_SIZE) + 1

        print(f"\nBatch {batch_num} ({len(batch)} records):")
        uploaded, failed = upload_batch(batch, batch_num)

        total_uploaded += uploaded
        total_failed += failed

        print(f"  Batch {batch_num} complete: +{uploaded} uploaded, +{failed} failed")
        print(f"  Running total: {total_uploaded} uploaded, {total_failed} failed")

        # Cooldown between batches (except after last batch)
        if batch_idx + BATCH_SIZE < len(all_records):
            print(f"  Cooling down {DELAY_BETWEEN_BATCHES}s...")
            time.sleep(DELAY_BETWEEN_BATCHES)

    # Final summary
    elapsed = time.time() - start_time
    print()
    print("=" * 60)
    print("UPLOAD COMPLETE")
    print("=" * 60)
    print(f"Total uploaded: {total_uploaded}")
    print(f"Total failed: {total_failed}")
    print(f"Time elapsed: {elapsed:.1f}s ({elapsed/60:.1f} min)")
    print(f"Success rate: {total_uploaded/(total_uploaded+total_failed)*100:.1f}%")
    print("=" * 60)

if __name__ == "__main__":
    main()
