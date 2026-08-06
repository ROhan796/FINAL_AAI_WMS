"""Directly populate DA Engine cache with 54-device mock telemetry."""
import sys, os, random, json
from datetime import datetime, timezone, timedelta

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.storage.cache import cache_store
from app.models.telemetry import NormalizedTelemetry
from app.analytics.airport.aggregator import airport_aggregator
from app.analytics.incidents.detector import incident_detector

random.seed(42)

DEVICES = [
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

now = datetime.now(timezone.utc)
telemetry_list = []

for did in DEVICES:
    parts = did.split("-")
    tid, fl, ut = parts[0], parts[1], parts[2]

    nh3 = round(random.uniform(0.5, 35.0), 2)
    occ = random.randint(0, 4)
    whi = round(max(0, 100 - (nh3 / 50 * 100) - (occ * 5)), 1)

    t = NormalizedTelemetry(
        device_id=did, terminal_id=tid, floor_level=fl,
        temperature_celsius=round(random.uniform(22.0, 29.0), 1),
        humidity_pct=round(random.uniform(40.0, 75.0), 1),
        ammonia_ppm=nh3, co2_ppm=round(random.uniform(400, 800), 1),
        occupancy_count=occ,
        soap_pct=round(random.uniform(70, 100), 1),
        paper_pct=round(random.uniform(70, 100), 1),
        sanitizer_pct=round(random.uniform(70, 100), 1),
        cleanliness_score=round(random.uniform(60, 95), 1),
        whi_score=whi,
        battery_pct=round(random.uniform(60, 100), 1),
        signal_rssi=round(random.uniform(-70, -45), 1),
        recorded_at=now - timedelta(seconds=random.randint(0, 120)),
        penalty_nh3=0, penalty_h2s=0, penalty_humidity=0, penalty_temperature=0,
        peak_nh3_ppm=round(nh3 * 1.2, 2),
        throughput=round(occ * 4.5, 1),
    )
    telemetry_list.append(t)
    cache_store.update_telemetry(did, t)

    for hist_i in range(9):
        hist_t = NormalizedTelemetry(
            device_id=did, terminal_id=tid, floor_level=fl,
            temperature_celsius=round(random.uniform(22.0, 29.0), 1),
            humidity_pct=round(random.uniform(40.0, 75.0), 1),
            ammonia_ppm=round(random.uniform(0.5, 35.0), 2),
            co2_ppm=round(random.uniform(400, 800), 1),
            occupancy_count=random.randint(0, 4),
            soap_pct=round(random.uniform(70, 100), 1),
            paper_pct=round(random.uniform(70, 100), 1),
            sanitizer_pct=round(random.uniform(70, 100), 1),
            cleanliness_score=round(random.uniform(60, 95), 1),
            whi_score=round(random.uniform(40, 95), 1),
            battery_pct=round(random.uniform(60, 100), 1),
            signal_rssi=round(random.uniform(-70, -45), 1),
            recorded_at=now - timedelta(hours=random.randint(1, 168)),
            penalty_nh3=0, penalty_h2s=0, penalty_humidity=0, penalty_temperature=0,
            peak_nh3_ppm=round(random.uniform(1, 40), 2),
            throughput=round(random.uniform(0, 20), 1),
        )
        cache_store.update_telemetry(did, hist_t)

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

print(f"Seeded {len(DEVICES)} devices x 10 history = {len(DEVICES)*10} readings")
print(f"Active incidents: {len(all_incidents)}")
print(f"Avg WHI: {summary.avg_whi}")
print(f"Total washrooms: {summary.total_washrooms}")
print("Cache populated successfully!")
