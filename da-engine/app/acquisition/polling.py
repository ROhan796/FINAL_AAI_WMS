import asyncio
import json
import random
from pathlib import Path
from typing import Optional, Set
from loguru import logger
from datetime import datetime, timezone

from app.config.settings import settings
from app.acquisition.api_client import api_client
from app.acquisition.retry import circuit_breaker
from app.acquisition.downloader import downloader


class TelemetryPoller:
    def __init__(self):
        self.seen_files: Set[str] = set()
        self.last_poll_time: Optional[datetime] = None
        self.last_poll_status: bool = False
        self.total_processed_count: int = 0
        self.consecutive_failures: int = 0
        self.running = False
        self._task = None
        self._download_semaphore: Optional[asyncio.Semaphore] = None
        self._seen_file_path = Path("data/seen_files.json")

    def _load_seen_files(self):
        """Persist seen files across restarts to avoid re-downloading."""
        try:
            if self._seen_file_path.exists():
                data = json.loads(self._seen_file_path.read_text())
                self.seen_files = set(data)
                logger.info(f"Loaded {len(self.seen_files)} seen files from disk")
        except Exception as e:
            logger.warning(f"Failed to load seen files: {e}")

    def _save_seen_files(self):
        """Save seen files periodically to persist across restarts."""
        try:
            self._seen_file_path.parent.mkdir(parents=True, exist_ok=True)
            self._seen_file_path.write_text(json.dumps(list(self.seen_files)))
        except Exception as e:
            logger.warning(f"Failed to save seen files: {e}")

    async def start(self):
        if self.running:
            return
        self.running = True
        self._download_semaphore = asyncio.Semaphore(settings.MAX_CONCURRENT_DOWNLOADS)
        self._load_seen_files()
        self._task = asyncio.create_task(self._loop())
        logger.info(
            f"Telemetry acquisition poller started "
            f"(max_files={settings.MAX_FILES_PER_POLL}, "
            f"concurrency={settings.MAX_CONCURRENT_DOWNLOADS})"
        )

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
        await asyncio.sleep(1.0)
        while self.running:
            try:
                await self.poll_now()
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Error in poll loop: {e}")

            sleep_time = settings.POLLING_INTERVAL_SECONDS
            if circuit_breaker.state == "open":
                sleep_time = max(sleep_time, 60)
                logger.warning(f"Circuit breaker open — sleeping {sleep_time}s before retry")
            elif self.consecutive_failures > 3:
                backoff = min(self.consecutive_failures * 10, 120)
                sleep_time = max(sleep_time, backoff)
                logger.info(f"Backoff: sleeping {sleep_time}s after {self.consecutive_failures} failures")

            # Extra cooldown if recently rate limited
            import time
            if api_client._last_429_time > 0:
                since_429 = time.monotonic() - api_client._last_429_time
                if since_429 < 30:
                    extra_wait = 30 - since_429 + random.uniform(1, 3)
                    sleep_time = max(sleep_time, extra_wait)
                    logger.info(f"Rate limit cooldown: sleeping {extra_wait:.1f}s extra")

            await asyncio.sleep(sleep_time)

    async def poll_now(self):
        if not circuit_breaker.allow_request():
            logger.warning("Circuit breaker open — skipping poll")
            return

        logger.info("Polling NSCBI API for new telemetry files...")
        try:
            files = await api_client.list_files()

            self.last_poll_status = True
            self.last_poll_time = datetime.now(timezone.utc)
            self.consecutive_failures = 0

            new_files = [f for f in files if f not in self.seen_files]
            if not new_files:
                logger.info("No new files to process.")
                return

            # Cap batch size to avoid overwhelming the API
            batch = new_files[:settings.MAX_FILES_PER_POLL]
            logger.info(
                f"Found {len(new_files)} new files, processing batch of {len(batch)} "
                f"(cap: {settings.MAX_FILES_PER_POLL})"
            )

            from app.services.analytics_service import analytics_service

            processed = 0
            failed = 0

            async def download_one(filename: str):
                nonlocal processed, failed
                if not circuit_breaker.allow_request():
                    logger.warning("Circuit breaker open — stopping file processing mid-batch")
                    return

                async with self._download_semaphore:
                    try:
                        payloads = await downloader.download(filename)
                        if payloads:
                            await analytics_service.process_raw_payloads(payloads)
                            self.total_processed_count += len(payloads)
                            processed += 1
                        self.seen_files.add(filename)
                    except Exception as ex:
                        logger.error(f"Failed to process {filename}: {ex}")
                        failed += 1

            # Process files with controlled concurrency
            tasks = [download_one(f) for f in batch]
            await asyncio.gather(*tasks, return_exceptions=True)

            logger.info(
                f"Poll complete: {processed} processed, {failed} failed, "
                f"{len(self.seen_files)} total seen"
            )

            # Persist seen files to disk
            self._save_seen_files()

            await self._broadcast_update()

        except Exception as e:
            self.last_poll_status = False
            self.consecutive_failures += 1
            circuit_breaker.record_failure()
            logger.warning(
                f"NSCBI API unavailable: {e} "
                f"(failures: {self.consecutive_failures}, breaker: {circuit_breaker.state})"
            )

    async def _broadcast_update(self):
        try:
            from app.realtime.hub import realtime_hub
            from app.storage.cache import cache_store

            if realtime_hub.connection_count == 0:
                return

            all_telemetry = await cache_store.get_all_telemetry()
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
                        "temperature_celsius": getattr(t, 'temperature_celsius', 0.0),
                        "humidity_pct": getattr(t, 'humidity_pct', 0.0),
                        "battery_pct": getattr(t, 'battery_pct', 0.0),
                        "signal_rssi": getattr(t, 'signal_rssi', 0.0),
                        "peak_nh3_ppm": getattr(t, 'peak_nh3_ppm', 0.0),
                        "throughput": getattr(t, 'throughput', 0.0),
                        "last_updated": getattr(t, 'recorded_at', ''),
                    })
                await realtime_hub.broadcast_telemetry_update(telemetry_data)

            incidents = cache_store.active_incidents
            if incidents:
                await realtime_hub.broadcast_incidents_update(incidents)

            summary = await cache_store.get_airport_summary()
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

            trends_data = {"hourly": [], "daily": []}
            hourly_buckets = {}
            for t in all_telemetry:
                recorded = getattr(t, 'recorded_at', None)
                if recorded:
                    hour_key = str(recorded)[:13]
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

        except Exception as e:
            logger.error(f"Broadcast failed: {e}")


telemetry_poller = TelemetryPoller()
