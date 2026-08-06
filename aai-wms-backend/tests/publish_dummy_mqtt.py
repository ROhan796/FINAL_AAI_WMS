import sys
from pathlib import Path

# Add project root to python path to import app config
sys.path.append(str(Path(__file__).resolve().parent.parent))

import asyncio
import json
import ssl
from datetime import datetime, timezone
import aiomqtt
from app.core.config import settings

async def publish_messages():
    client_args = {
        "hostname": settings.MQTT_HOST,
        "port": settings.MQTT_PORT,
        "username": settings.MQTT_USER,
        "password": settings.MQTT_PASSWORD,
    }

    if settings.MQTT_USE_TLS:
        ssl_ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
        if settings.MQTT_CA_CERT_PATH:
            ssl_ctx.load_verify_locations(cafile=settings.MQTT_CA_CERT_PATH)
        # Devices must use device-specific certificates to be authorized to publish telemetry
        ssl_ctx.load_cert_chain(
            certfile="certs/devices/pico-T1-W01.crt",
            keyfile="certs/devices/pico-T1-W01.key"
        )
        ssl_ctx.check_hostname = False
        ssl_ctx.verify_mode = ssl.CERT_REQUIRED
        client_args["tls_context"] = ssl_ctx

    print(f"Connecting to MQTT broker on {client_args['hostname']}:{client_args['port']} (TLS: {settings.MQTT_USE_TLS})...")
    async with aiomqtt.Client(**client_args) as client:
        
        # Helper to create telemetry payload dict
        def make_payload(device_id: str, raw_whi: float):
            return {
                "device_id": device_id,
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "avg_nh3_ppm": 5.0,
                "peak_nh3_ppm": 10.0,
                "avg_temperature_c": 23.5,
                "avg_humidity_percent": 58.0,
                "throughput": 4,
                "occupancy_inside": 2,
                "abandon_rate_percent": 0.0,
                "raw_whi": raw_whi
            }

        # 1. Send 3 critical messages for L2_WashroomA
        print("\nPublishing 3 critical telemetry readings for L2_WashroomA...")
        for i in range(3):
            topic = "washroom/T1/L2_WashroomA/telemetry"
            payload = make_payload("pico-washroom-a", 15.0)
            await client.publish(topic, payload=json.dumps(payload))
            print(f"  Published critical message {i+1} to {topic}")
            await asyncio.sleep(0.5)

        # 2. Send 3 critical messages for L2_WashroomB
        print("\nPublishing 3 critical telemetry readings for L2_WashroomB...")
        for i in range(3):
            topic = "washroom/T1/L2_WashroomB/telemetry"
            payload = make_payload("pico-washroom-b", 15.0)
            await client.publish(topic, payload=json.dumps(payload))
            print(f"  Published critical message {i+1} to {topic}")
            await asyncio.sleep(0.5)

        # Wait a moment
        await asyncio.sleep(1.0)
        
        # 3. Recover L2_WashroomA by sending a normal reading
        print("\nPublishing 1 normal telemetry reading to recover L2_WashroomA...")
        topic = "washroom/T1/L2_WashroomA/telemetry"
        payload = make_payload("pico-washroom-a", 85.0)
        await client.publish(topic, payload=json.dumps(payload))
        print(f"  Published normal message to {topic}")
        
        print("\nDone publishing dummy MQTT telemetry messages!")

if __name__ == "__main__":
    asyncio.run(publish_messages())
