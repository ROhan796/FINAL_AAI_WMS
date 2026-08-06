import asyncio
from typing import Optional, Set
from loguru import logger
from datetime import datetime, timezone

from app.config.settings import settings
from app.acquisition.api_client import api_client
from app.acquisition.downloader import downloader

class TelemetryPoller:
    def __init__(self):
        self.seen_files: Set[str] = set()
        self.last_poll_time: Optional[datetime] = None
        self.last_poll_status: bool = False
        self.total_processed_count: int = 0
        self.running = False
        self._task = None

    async def start(self):
        if self.running:
            return
        self.running = True
        self._task = asyncio.create_task(self._loop())
        logger.info("Telemetry acquisition poller background worker started.")

    async def stop(self):
        if not self.running:
            return
        self.running = False
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
        await api_client.close()
        logger.info("Telemetry acquisition poller stopped.")

    async def _loop(self):
        # Allow the API router to start up
        await asyncio.sleep(1.0)
        while self.running:
            try:
                await self.poll_now()
            except Exception as e:
                logger.error(f"Error in poll loop: {e}")
            await asyncio.sleep(settings.POLLING_INTERVAL_SECONDS)

    async def poll_now(self):
        logger.info("Polling NSCBI API for new telemetry files...")
        try:
            files = await api_client.list_files()
            
            self.last_poll_status = True
            self.last_poll_time = datetime.now(timezone.utc)
            
            new_files = [f for f in files if f not in self.seen_files]
            if not new_files:
                logger.info("No new files to process.")
                return
            
            logger.info(f"Found {len(new_files)} new files to process.")
            
            # Import dynamically to avoid circular references during initialization
            from app.services.analytics_service import analytics_service

            # Process files concurrently (max 5 at a time to avoid API rate limits)
            concurrency_semaphore = asyncio.Semaphore(5)

            async def _process_file(filename: str):
                async with concurrency_semaphore:
                    try:
                        payloads = await downloader.download(filename)
                        if payloads:
                            logger.info(f"Ingesting {len(payloads)} payloads from {filename}")
                            await analytics_service.process_raw_payloads(payloads)
                            self.total_processed_count += len(payloads)
                        self.seen_files.add(filename)
                    except Exception as ex:
                        logger.error(f"Failed to process file {filename}: {ex}")

            await asyncio.gather(*[_process_file(f) for f in new_files], return_exceptions=True)

            # Broadcast real-time update to all WebSocket clients
            await self._broadcast_update()
                    
        except Exception as e:
            self.last_poll_status = False
            logger.warning(f"NSCBI API unavailable or polling failed: {e}. Active caches will serve stale data.")

    async def _broadcast_update(self):
        """Broadcast current cache state to all connected WebSocket clients."""
        try:
            from app.realtime.hub import realtime_hub
            from app.storage.cache import cache_store
            from app.analytics.airport.aggregator import airport_aggregator

            if realtime_hub.connection_count == 0:
                return

            # Broadcast telemetry
            all_telemetry = cache_store.get_all_telemetry()
            if all_telemetry:
                telemetry_data = []
                for t in all_telemetry:
                    telemetry_data.append({
                        "device_id": t.device_id,
                        "terminal_id": getattr(t, 'terminal_id', ''),
                        "floor_level": getattr(t, 'floor_level', ''),
                        "whi_score": getattr(t, 'whi_score', 0.0),
                        "ammonia_ppm": getattr(t, 'ammonia_ppm', 0.0),
                        "occupancy_count": getattr(t, 'occupancy_count', 0),
                        "soap_pct": getattr(t, 'soap_pct', 0.0),
                        "paper_pct": getattr(t, 'paper_pct', 0.0),
                        "sanitizer_pct": getattr(t, 'sanitizer_pct', 0.0),
                        "temperature_celsius": getattr(t, 'temperature_celsius', 0.0),
                        "humidity_pct": getattr(t, 'humidity_pct', 0.0),
                        "battery_pct": getattr(t, 'battery_pct', 0.0),
                        "last_updated": getattr(t, 'recorded_at', ''),
                    })
                await realtime_hub.broadcast_telemetry_update(telemetry_data)

            # Broadcast incidents
            incidents = cache_store.active_incidents
            if incidents:
                await realtime_hub.broadcast_incidents_update(incidents)

            # Broadcast summary with terminal breakdown
            summary = cache_store.get_airport_summary()
            if summary:
                terminal_summaries = []
                terminals = {}
                for t in all_telemetry:
                    tid = getattr(t, 'terminal_id', 'Unknown')
                    if tid not in terminals:
                        terminals[tid] = {'whi_scores': [], 'critical': 0}
                    terminals[tid]['whi_scores'].append(getattr(t, 'whi_score', 0))
                    if getattr(t, 'whi_score', 0) < 60:
                        terminals[tid]['critical'] += 1
                for tid, data in terminals.items():
                    avg = sum(data['whi_scores']) / len(data['whi_scores']) if data['whi_scores'] else 0
                    terminal_summaries.append({
                        'terminal': tid,
                        'avg_whi': round(avg, 1),
                        'critical_count': data['critical'],
                        'washroom_count': len(data['whi_scores']),
                    })

                summary_dict = {
                    "avg_whi": getattr(summary, 'avg_whi', 0.0),
                    "total_washrooms": getattr(summary, 'total_washrooms', 0),
                    "critical_count": getattr(summary, 'critical_count', 0),
                    "warning_count": getattr(summary, 'warning_count', 0),
                    "good_count": getattr(summary, 'good_count', 0),
                    "online_devices": getattr(summary, 'online_devices', 0),
                    "terminal_summaries": terminal_summaries,
                }
                await realtime_hub.broadcast_summary_update(summary_dict)

            # Broadcast live WHI with by_terminal aggregation
            live_whi = []
            by_terminal = {}
            for t in all_telemetry[:20]:
                terminal_id = getattr(t, 'terminal_id', '')
                live_whi.append({
                    "device_id": t.device_id,
                    "terminal": terminal_id,
                    "floor": getattr(t, 'floor_level', ''),
                    "whi": getattr(t, 'whi_score', 0.0),
                    "status": "Good" if getattr(t, 'whi_score', 0) >= 80 else "Fair" if getattr(t, 'whi_score', 0) >= 60 else "Critical",
                    "occupancy": getattr(t, 'occupancy_count', 0),
                    "ammonia_ppm": getattr(t, 'ammonia_ppm', 0.0),
                    "last_updated": str(getattr(t, 'recorded_at', '')),
                })
                if terminal_id not in by_terminal:
                    by_terminal[terminal_id] = {'scores': [], 'critical': 0}
                by_terminal[terminal_id]['scores'].append(getattr(t, 'whi_score', 0))
                if getattr(t, 'whi_score', 0) < 60:
                    by_terminal[terminal_id]['critical'] += 1

            by_terminal_out = {}
            for tid, data in by_terminal.items():
                avg = sum(data['scores']) / len(data['scores']) if data['scores'] else 0
                by_terminal_out[tid] = {
                    'avg_whi': round(avg, 1),
                    'critical_count': data['critical'],
                }

            await realtime_hub.broadcast_live_whi({
                "rankings": live_whi,
                "count": len(live_whi),
                "by_terminal": by_terminal_out,
            })

            # Broadcast trends (hourly aggregation from telemetry)
            trends_data = {"hourly": [], "daily": []}
            hourly_buckets = {}
            for t in all_telemetry:
                recorded = getattr(t, 'recorded_at', None)
                if recorded:
                    hour_key = str(recorded)[:13]  # YYYY-MM-DDTHH
                    if hour_key not in hourly_buckets:
                        hourly_buckets[hour_key] = []
                    hourly_buckets[hour_key].append(getattr(t, 'whi_score', 0))
            for hour_key in sorted(hourly_buckets.keys())[-24:]:
                scores = hourly_buckets[hour_key]
                trends_data["hourly"].append({
                    "hour": hour_key,
                    "avg_whi": round(sum(scores) / len(scores), 1) if scores else 0,
                    "count": len(scores),
                })
            await realtime_hub.broadcast_trends_update(trends_data)

            # Broadcast washroom list with real-time scores
            washroom_list = []
            for t in all_telemetry:
                washroom_list.append({
                    "device_id": t.device_id,
                    "terminal": getattr(t, 'terminal_id', ''),
                    "level": getattr(t, 'floor_level', ''),
                    "whi": getattr(t, 'whi_score', 0.0),
                    "status": "Good" if getattr(t, 'whi_score', 0) >= 80 else "Fair" if getattr(t, 'whi_score', 0) >= 60 else "Critical",
                    "ammonia_ppm": getattr(t, 'ammonia_ppm', 0.0),
                    "occupancy_count": getattr(t, 'occupancy_count', 0),
                    "temperature_celsius": getattr(t, 'temperature_celsius', 0.0),
                    "humidity_pct": getattr(t, 'humidity_pct', 0.0),
                    "battery_pct": getattr(t, 'battery_pct', 0.0),
                    "last_updated": str(getattr(t, 'recorded_at', '')),
                })
            await realtime_hub.broadcast_washrooms_update(washroom_list)

            # Broadcast device status
            devices = []
            for t in all_telemetry:
                devices.append({
                    "device_id": t.device_id,
                    "terminal": getattr(t, 'terminal_id', ''),
                    "level": getattr(t, 'floor_level', ''),
                    "battery_pct": getattr(t, 'battery_pct', 100.0),
                    "status": "ONLINE",
                    "last_ping": str(getattr(t, 'recorded_at', '')),
                    "type": getattr(t, 'device_type', 'PPM'),
                })
            await realtime_hub.broadcast_devices_update(devices)

            logger.debug(f"Broadcasted update to {realtime_hub.connection_count} clients")
        except Exception as e:
            logger.error(f"Broadcast failed: {e}")

telemetry_poller = TelemetryPoller()
