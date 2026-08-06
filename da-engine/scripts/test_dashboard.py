import requests
import json

r = requests.get("http://localhost:8001/api/dashboard/summary", timeout=15)
print(f"Status: {r.status_code}")
j = r.json()
print(f"Airport WHI: {j.get('airport_whi')}")
print(f"Total washrooms: {j.get('total_washrooms')}")
print(f"Online devices: {j.get('online_devices')}")
print(f"Critical: {j.get('critical_count')}")
for t in j.get("terminal_summaries", []):
    print(f"  {t['terminal_id']}: avg={t['avg_whi']} total={t['total']} critical={t['critical']}")
print(f"\nWashroom list count: {len(j.get('washroom_list', []))}")
