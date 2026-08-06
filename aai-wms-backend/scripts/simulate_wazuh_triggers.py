#!/usr/bin/env python
import os
import sys
import json
import time
import asyncio
from datetime import datetime, timezone

# Add parent directory to path to import db manager
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Log directory mapping (default to host paths, fallback to local workspace paths if not writable)
LOG_DIRS = {
    "fastapi": "/var/log/aai-wms/fastapi",
    "postgres": "/var/log/aai-wms/postgres",
    "emqx": "/var/log/aai-wms/emqx"
}

def get_writable_log_path(service, filename):
    host_dir = LOG_DIRS[service]
    try:
        if not os.path.exists(host_dir):
            os.makedirs(host_dir, exist_ok=True)
        path = os.path.join(host_dir, filename)
        with open(path, "a") as f:
            pass
        return path
    except Exception:
        # Fallback to local workspace logs
        local_dir = f"./logs/{service}"
        os.makedirs(local_dir, exist_ok=True)
        return os.path.join(local_dir, filename)

async def simulate_db_trigger_violation():
    print("--- Simulating Database Immutability Trigger Violation (Level 10) ---")
    from app.db.postgres import db_manager
    from app.core.config import settings
    
    # Temporarily bind db manager
    await db_manager.connect()
    try:
        print("Attempting to run unauthorized DELETE on historical log table incident_events...")
        await db_manager.execute("DELETE FROM incident_events WHERE washroom_id = 'L2_TestRoom'")
    except Exception as e:
        print(f"PostgreSQL Trigger Exception successfully caught:\n{e}\n")
    finally:
        await db_manager.disconnect()

def simulate_rate_limit_hit(log_path):
    print(f"--- Simulating Ingestion Rate Limit Hit (Level 5) ---")
    log_entry = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "service": "rate_limit",
        "level": "WARNING",
        "event": "Device pico-T1-W01 exceeded rate limit",
        "device_id": "pico-T1-W01"
    }
    with open(log_path, "a") as f:
        f.write(json.dumps(log_entry) + "\n")
    print(f"Appended log warning to {log_path}\n")

def simulate_mqtt_failures(log_path):
    print(f"--- Simulating MQTT Authentication failures & Frequency Escalation (Level 3 & 12) ---")
    # Write 5 failures to trigger Level 12 frequency rule
    src_ip = "172.20.1.55"
    print(f"Writing 5 mTLS/ACL connection failure events for IP {src_ip}...")
    for i in range(5):
        timestamp = datetime.now(timezone.utc).isoformat()
        log_line = f"{timestamp} [error] client {src_ip}: failed mTLS handshake - Client certificate verification failed\n"
        with open(log_path, "a") as f:
            f.write(log_line)
        time.sleep(0.1)
    print(f"Appended 5 failure lines to {log_path}\n")

def simulate_file_integrity_modification():
    print("--- Simulating File Integrity Monitoring (FIM) Syscheck Alert (Level 11) ---")
    # Touch acl.json to update its modified time
    acl_path = "./emqx/acl.json"
    if os.path.exists(acl_path):
        os.utime(acl_path, None)
        print(f"Updated modification time for {acl_path} to trigger FIM alert.\n")
    else:
        print(f"Skipping: {acl_path} not found.\n")

async def main():
    print("====================================================")
    print("           WMS Wazuh Alert Trigger Simulator        ")
    print("====================================================\n")
    
    fastapi_log = get_writable_log_path("fastapi", "fastapi.log")
    emqx_log = get_writable_log_path("emqx", "emqx.log")
    
    # 1. Rate Limit
    simulate_rate_limit_hit(fastapi_log)
    
    # 2. MQTT Failures
    simulate_mqtt_failures(emqx_log)
    
    # 3. DB Trigger
    try:
        await simulate_db_trigger_violation()
    except Exception as e:
        print(f"Skipped DB trigger test: {e}\n")
        
    # 4. FIM
    simulate_file_integrity_modification()
    
    print("Simulation complete! Check Wazuh manager alert dashboard or host alerts log.")

if __name__ == "__main__":
    asyncio.run(main())
