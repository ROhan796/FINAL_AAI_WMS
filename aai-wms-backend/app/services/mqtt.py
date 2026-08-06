import asyncio
import json
import os
import aiomqtt
from app.core.config import settings
from app.core.logger import logger
from app.models.schemas import TelemetryPayload
from pydantic import ValidationError
from app.services.rate_limit import RateLimiter
from app.services.queue import queue_router
from app.db.redis import get_redis
from app.services.audit import audit_batcher


class MQTTSubscriber:
    def __init__(self):
        self.client_args = {
            "hostname": settings.MQTT_HOST,
            "port": settings.MQTT_PORT,
            "username": settings.MQTT_USER,
            "password": settings.MQTT_PASSWORD,
        }
        self.reconnect_interval = 3

        if settings.MQTT_USE_TLS:
            import ssl
            ssl_ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
            ssl_ctx.check_hostname = False

            ca_path = settings.MQTT_CA_CERT_PATH
            if ca_path and os.path.isfile(ca_path):
                ssl_ctx.load_verify_locations(cafile=ca_path)
                ssl_ctx.verify_mode = ssl.CERT_REQUIRED
            else:
                # EMQX Cloud: no local CA cert — use system certs or skip verification
                ssl_ctx.check_hostname = False
                ssl_ctx.verify_mode = ssl.CERT_NONE

            # Only load client certs if both are configured (mTLS)
            client_cert = settings.MQTT_CLIENT_CERT_PATH
            client_key = settings.MQTT_CLIENT_KEY_PATH
            if client_cert and client_key and os.path.isfile(client_cert) and os.path.isfile(client_key):
                ssl_ctx.load_cert_chain(certfile=client_cert, keyfile=client_key)

            self.client_args["tls_context"] = ssl_ctx

    async def start(self):
        logger.info("Starting MQTT Subscriber...")
        redis = await get_redis()
        rate_limiter = RateLimiter(redis)

        while True:
            try:
                async with aiomqtt.Client(**self.client_args) as client:
                    await client.subscribe("washroom/+/+/telemetry")
                    await client.subscribe("washroom/+/+/alerts")
                    logger.info("Successfully subscribed to MQTT topics")

                    async for message in client.messages:
                        await self.process_message(message, rate_limiter)
            except aiomqtt.MqttError as error:
                logger.error(f"MQTT connection error: {error}. Reconnecting in {self.reconnect_interval}s...")
                await asyncio.sleep(self.reconnect_interval)
            except asyncio.CancelledError:
                logger.info("MQTT Subscriber stopped")
                break
            except Exception as e:
                logger.error(f"Unexpected MQTT error: {e}")
                await asyncio.sleep(self.reconnect_interval)

    async def process_message(self, message, rate_limiter: RateLimiter):
        topic = str(message.topic)
        payload_bytes = message.payload

        # Audit tap - capture raw message before parsing
        try:
            await audit_batcher.push_raw(topic, payload_bytes)
        except Exception as e:
            logger.warning(f"Failed to push message to raw audit log (topic={topic}): {e}")

        # 1. Parse JSON
        try:
            payload_dict = json.loads(payload_bytes.decode())
        except Exception as e:
            logger.warning(f"Rejected malformed JSON from {topic}: {e}")
            return

        # 2. Extract context from topic
        parts = topic.split('/')
        if len(parts) >= 4:
            payload_dict['terminal'] = parts[1]
            payload_dict['washroom_id'] = parts[2]
            payload_dict['msg_type'] = parts[3]

        # 3. Pydantic Validation
        try:
            payload = TelemetryPayload(**payload_dict)
        except ValidationError as e:
            logger.warning(f"Rejected invalid schema from {topic}: {e.errors()}")
            return

        # 4. Rate Limiting
        if not await rate_limiter.is_allowed(payload.device_id):
            return

        # 5. Broadcast to WebSocket clients (real-time push to portal)
        try:
            from app.realtime.hub import wms_realtime_hub
            if wms_realtime_hub.connection_count > 0:
                await wms_realtime_hub.broadcast_telemetry({
                    "device_id": payload.device_id,
                    "terminal": payload.terminal,
                    "washroom_id": payload.washroom_id,
                    "avg_nh3_ppm": payload.avg_nh3_ppm,
                    "peak_nh3_ppm": payload.peak_nh3_ppm,
                    "avg_temperature_c": payload.avg_temperature_c,
                    "avg_humidity_percent": payload.avg_humidity_percent,
                    "occupancy_inside": payload.occupancy_inside,
                    "raw_whi": payload.raw_whi,
                    "throughput": payload.throughput,
                    "timestamp": str(payload.timestamp),
                })
        except Exception as e:
            logger.debug(f"WebSocket broadcast skipped: {e}")

        # 6. Route to Queue
        await queue_router.route_message(payload)


mqtt_subscriber = MQTTSubscriber()
