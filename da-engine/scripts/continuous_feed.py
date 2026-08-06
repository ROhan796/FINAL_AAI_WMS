#!/usr/bin/env python3
"""
NSCBI Airport — Continuous Feed Script
Sends one reading every 30 seconds, rotating through all 54 devices
"""

import random
import time
import requests
import os
from datetime import datetime, timezone
from typing import Dict, Any

# Import from generate_and_upload
from generate_and_upload import (
    DEVICE_IDS,
    RANGES,
    compute_penalties,
    API_URL,
    API_KEY,
    HEADERS,
)

# Configuration
FEED_INTERVAL = 30  # seconds between readings

def generate_current_reading(device_id: str) -> Dict[str, Any]:
    """Generate a single current reading for a device"""
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
        "timestamp": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
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

def upload_reading(record: Dict[str, Any]) -> bool:
    """Upload a single reading to the API"""
    try:
        resp = requests.post(API_URL, json=record, headers=HEADERS, timeout=30)

        if resp.status_code == 429:
            print(f"  Rate limited. Waiting 120s...")
            time.sleep(120)
            resp = requests.post(API_URL, json=record, headers=HEADERS, timeout=30)

        if resp.status_code in (200, 201):
            data = resp.json()
            filename = data.get("filename", "unknown")
            print(f"  OK: {record['deviceId']} -> {filename} (WHI={record['raw_whi']})")
            return True
        else:
            print(f"  FAIL: {record['deviceId']} ({resp.status_code})")
            return False

    except Exception as e:
        print(f"  ERROR: {e}")
        return False

def main():
    print("=" * 60)
    print("NSCBI Airport — Continuous Feed")
    print("=" * 60)
    print(f"Devices: {len(DEVICE_IDS)}")
    print(f"Interval: {FEED_INTERVAL}s")
    print(f"API URL: {API_URL}")
    print()
    print("Press Ctrl+C to stop")
    print("-" * 60)

    device_index = 0
    reading_count = 0
    success_count = 0
    fail_count = 0

    try:
        while True:
            # Get current device in rotation
            device_id = DEVICE_IDS[device_index]

            # Generate and upload reading
            print(f"\n[{reading_count + 1}] Device: {device_id}")
            record = generate_current_reading(device_id)

            if upload_reading(record):
                success_count += 1
            else:
                fail_count += 1

            reading_count += 1

            # Move to next device (wrap around)
            device_index = (device_index + 1) % len(DEVICE_IDS)

            # Wait for next interval
            print(f"  Next device in {FEED_INTERVAL}s... (Total: {success_count} ok, {fail_count} failed)")
            time.sleep(FEED_INTERVAL)

    except KeyboardInterrupt:
        print()
        print("=" * 60)
        print("Feed stopped by user")
        print(f"Total readings: {reading_count}")
        print(f"Successful: {success_count}")
        print(f"Failed: {fail_count}")
        print("=" * 60)

if __name__ == "__main__":
    main()
