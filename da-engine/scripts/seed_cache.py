#!/usr/bin/env python3
"""
Seed the DA Engine in-memory cache with realistic telemetry for all 54 devices.
Run this AFTER starting the DA Engine to populate it with data.
Usage: cd da-engine && python scripts/seed_cache.py
"""

import sys
import os
import random
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.storage.cache import cache_store
from app.models.telemetry import NormalizedTelemetry
from app.analytics.airport.aggregator import airport_aggregator
from app.analytics.incidents.detector import incident_detector

DEVICE_IDS = [
    "T1-L1-PPD-001", "T1-L1-PPM-002", "T1-L1-PPF-003",
    "T1-L2-PPD-004", "T1-L2-PPM-005", "T1-L2-PPF-006",
    "T1-L3-PPD-007", "T1-L3-PPM-008", "T1-L3-PPF-009",
    "T1-L4-PPD-010", "T1-L4-PPM-011", "T1-L4-PPF-012",
    "T1-L5-PPD-013", "T1-L5-PPM-014", "T1-L5-PPF-015",
    "T1-L6-PPD-016", "T1-L6-PPM-017", "T1-L6-PPF-018",
    "T2-L1-PPD-019", "T2-L1-PPM-020", "T2-L1-PPF-021",
    "T2-L2-PPD-022", "T2-L2-PPM-023", "T2-L2-PPF-024",
    "T2-L3-PPD-025", "T2-L3-PPM-026", "T2-L3-PPF-027",
    "T2-L4-PPD-028", "T2-L4-PPM-029", "T2-L4-PPF-030",
    "T2-L5-PPD-031", "T2-L5-PPM-032", "T2-L5-PPF-033",
    "T2-L6-PPD-034", "T2-L6-PPM-035", "T2-L6-PPF-036",
    "T3-L1-PPD-037", "T3-L1-PPM-038", "T3-L1-PPF-039",
    "T3-L2-PPD-040", "T3-L2-PPM-041", "T3-L2-PPF-042",
    "T3-L3-PPD-043", "T3-L3-PPM-044", "T3-L3-PPF-045",
    "T3-L4-PPD-046", "T3-L4-PPM-047", "T3-L4-PPF-048",
    "T3-L5-PPD-049", "T3-L5-PPM-050", "T3-L5-PPF-051",
    "T3-L6-PPD-052", "T3-L6-PPM-053", "T3-L6-PPF-054",
]

UNIT_CAPACITY = {"PPD": 2, "PPM": 4, "PPF": 4}

SENSOR_RANGES = {
    "PPD": {"temp": (22, 26), "hum": (40, 60), "nh3": (0.5, 12), "h2s": (0.05, 1.0), "occ": (0, 2)},
    "PPM": {"temp": (23, 29), "hum": (50, 72), "nh3": (1, 35),  "h2s": (0.1, 2.5), "occ": (0, 4)},
    "PPF": {"temp": (22, 27), "hum": (45, 68), "nh3": (0.5, 22), "h2s": (0.05, 1.8), "occ": (0, 4)},
}

random.seed(42)

def compute_whi(cleanliness, occupancy, capacity, soap, paper, sanitizer, ammonia):
    occ_load = min((occupancy / capacity) * 100, 100) if capacity > 0 else 0
    supply = (soap + paper + sanitizer) / 3
    air = max(0, 100 - min((ammonia / 50) * 100, 100))
    return round(cleanliness * 0.35 + (100 - occ_load) * 0.20 + supply * 0.25 + air * 0.20, 1)

def generate_telemetry(device_id: str) -> NormalizedTelemetry:
    parts = device_id.split("-")
    terminal_id = parts[0]
    floor_level = parts[1]
    unit_type = parts[2]
    sr = SENSOR_RANGES[unit_type]
    capacity = UNIT_CAPACITY[unit_type]

    temp = round(random.uniform(*sr["temp"]), 1)
    hum = round(random.uniform(*sr["hum"]), 1)
    nh3 = round(random.uniform(*sr["nh3"]), 2)
    h2s = round(random.uniform(*sr["h2s"]), 2)
    occ = random.randint(*sr["occ"])
    soap = round(random.uniform(70, 100), 1)
    paper = round(random.uniform(70, 100), 1)
    sanitizer = round(random.uniform(70, 100), 1)
    cleanliness = round(random.uniform(60, 95), 1)
    battery = round(random.uniform(60, 100), 1)
    signal = round(random.uniform(-70, -45), 1)
    co2 = round(random.uniform(400, 800), 1)

    whi = compute_whi(cleanliness, occ, capacity, soap, paper, sanitizer, nh3)

    p_nh3 = 0 if nh3 < 5 else (10 if nh3 < 15 else (25 if nh3 < 30 else 40))
    p_h2s = 0 if h2s < 0.5 else (10 if h2s < 1 else (20 if h2s < 2 else 35))
    p_hum = 0 if 40 <= hum <= 65 else (15 if hum < 30 or hum > 80 else 5)
    p_tmp = 0 if 22 <= temp <= 26 else (15 if temp > 32 else 5)

    now = datetime.now(timezone.utc)

    return NormalizedTelemetry(
        device_id=device_id,
        terminal_id=terminal_id,
        floor_level=floor_level,
        temperature_celsius=temp,
        humidity_pct=hum,
        battery_pct=battery,
        signal_rssi=signal,
        ammonia_ppm=nh3,
        co2_ppm=co2,
        occupancy_count=occ,
        soap_pct=soap,
        paper_pct=paper,
        sanitizer_pct=sanitizer,
        cleanliness_score=cleanliness,
        recorded_at=now,
        whi_score=whi,
        penalty_nh3=p_nh3,
        penalty_h2s=p_h2s,
        penalty_humidity=p_hum,
        penalty_temperature=p_tmp,
        peak_nh3_ppm=round(nh3 * random.uniform(1.0, 1.5), 2),
        throughput=round(occ * random.uniform(3, 6), 1),
    )

def main():
    print("=" * 60)
    print("DA Engine Cache Seeder — 54 Devices")
    print("=" * 60)

    for device_id in DEVICE_IDS:
        telemetry = generate_telemetry(device_id)
        cache_store.update_telemetry(device_id, telemetry)

    all_telemetry = cache_store.get_all_telemetry()

    all_incidents = []
    for t in all_telemetry:
        detected = incident_detector.detect_breaches(t)
        for d in detected:
            d["device_id"] = t.device_id
        all_incidents.extend(detected)
    cache_store.set_active_incidents(all_incidents)

    summary = airport_aggregator.aggregate(all_telemetry, all_incidents)
    cache_store.set_airport_summary(summary)

    print(f"Seeded {len(cache_store.telemetry_snapshots)} devices into cache")
    print(f"Airport WHI: {summary.avg_whi}")
    print(f"Active incidents: {len(all_incidents)}")

    print("\nPer-terminal breakdown:")
    for ts in summary.terminals:
        print(f"  {ts.terminal_id}: avg_whi={ts.avg_whi}, total={ts.total_washrooms}, critical={ts.active_incidents}")

    print("\nAll washrooms:")
    for did, t in sorted(cache_store.telemetry_snapshots.items()):
        print(f"  {did}: whi={t.whi_score}, nh3={t.ammonia_ppm}, occ={t.occupancy_count}")

    print("\n" + "=" * 60)
    print("DONE — DA Engine cache is populated!")
    print("Test: curl http://localhost:8001/api/dashboard/summary")
    print("=" * 60)

if __name__ == "__main__":
    main()
