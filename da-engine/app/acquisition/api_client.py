import asyncio
import httpx
from typing import List, Dict, Any, Optional
from loguru import logger
import random
from datetime import datetime, timezone

from app.config.settings import settings
from app.acquisition.authentication import authenticator
from app.acquisition.retry import nscbi_retry_decorator
from app.acquisition.rate_limit import rate_limiter

class AcquisitionClient:
    def __init__(self):
        self._client: Optional[httpx.AsyncClient] = None

    @property
    def base_url(self) -> str:
        return settings.NSCBI_API_BASE_URL

    async def get_client(self) -> httpx.AsyncClient:
        if self._client is None or self._client.is_closed:
            # Create AsyncClient with connection pooling (limits configuration)
            limits = httpx.Limits(max_keepalive_connections=5, max_connections=10)
            self._client = httpx.AsyncClient(limits=limits, timeout=15.0)
        return self._client

    async def close(self):
        if self._client is not None and not self._client.is_closed:
            await self._client.aclose()

    @nscbi_retry_decorator
    async def _make_request(self, method: str, endpoint: str, params: Optional[Dict[str, Any]] = None) -> httpx.Response:
        await rate_limiter.acquire()
        client = await self.get_client()
        url = f"{self.base_url.rstrip('/')}/{endpoint.lstrip('/')}"
        
        headers = authenticator.inject_auth_header({})
        
        logger.debug(f"Making {method} request to {url}")
        response = await client.request(method, url, headers=headers, params=params)
        response.raise_for_status()
        return response

    async def _list_files_for_device(self, did: str, from_date: Optional[str] = None, to_date: Optional[str] = None) -> List[str]:
        """List all files for a single device, handling pagination."""
        filenames: List[str] = []
        page_limit = 100
        offset = 0

        while True:
            params: Dict[str, Any] = {"limit": page_limit, "offset": offset, "device_id": did}
            if from_date:
                params["from_date"] = from_date
            if to_date:
                params["to_date"] = to_date

            try:
                response = await self._make_request("GET", "/files", params=params)
                data = response.json()

                if isinstance(data, dict) and "data" in data:
                    file_list = data["data"]
                    if isinstance(file_list, list):
                        for entry in file_list:
                            if isinstance(entry, dict) and "filename" in entry:
                                filenames.append(entry["filename"])
                            elif isinstance(entry, str):
                                filenames.append(entry)

                    pagination = data.get("pagination", {})
                    has_more = pagination.get("has_more", False)
                    total = pagination.get("total", 0)

                    if not has_more or offset + page_limit >= total:
                        break
                    offset += page_limit
                elif isinstance(data, list):
                    filenames.extend(data)
                    break
                else:
                    break
            except Exception as e:
                logger.error(f"Error listing files for device {did} at offset {offset}: {e}")
                break

        return filenames

    async def list_files(self, device_id: Optional[str] = None, from_date: Optional[str] = None, to_date: Optional[str] = None, limit: Optional[int] = None) -> List[str]:
        """
        GET /api/files -> returns ALL filenames by paginating through results.
        Polls ALL device IDs in parallel using asyncio.gather for faster acquisition.
        API response format: {"success": true, "data": [...], "pagination": {...}}
        """
        if self.base_url.upper() == "MOCK":
            return ["mock_batch_1.json", "mock_batch_2.json"]

        device_ids = settings.device_id_list
        if not device_ids:
            logger.warning("No device IDs configured in NSCBI_DEVICE_IDS")
            return []

        # Parallel fetch across all devices (max 10 concurrent to respect connection pool)
        semaphore = asyncio.Semaphore(10)

        async def _bounded_fetch(did: str) -> List[str]:
            async with semaphore:
                return await self._list_files_for_device(did, from_date, to_date)

        results = await asyncio.gather(*[_bounded_fetch(did) for did in device_ids], return_exceptions=True)

        all_filenames: List[str] = []
        for i, result in enumerate(results):
            if isinstance(result, Exception):
                logger.error(f"Device {device_ids[i]} fetch failed: {result}")
            elif isinstance(result, list):
                all_filenames.extend(result)

        # Deduplicate while preserving order
        seen = set()
        unique: List[str] = []
        for f in all_filenames:
            if f not in seen:
                seen.add(f)
                unique.append(f)

        logger.info(f"Listed {len(unique)} total files from API across {len(device_ids)} devices (parallel).")
        return unique

    async def download_file(self, filename: str) -> List[Dict[str, Any]]:
        """
        GET /api/files/{filename} -> returns file contents.
        API may return raw JSON content or wrapped in {"success": true, "data": ...}
        """
        if self.base_url.upper() == "MOCK" or filename.startswith("mock_"):
            return self._generate_mock_telemetry(filename)

        await asyncio.sleep(1.5)
        try:
            response = await self._make_request("GET", f"/files/{filename}")
            data = response.json()
            # Handle wrapped response format
            if isinstance(data, dict):
                if "data" in data:
                    content = data["data"]
                    if isinstance(content, list):
                        return content
                    elif isinstance(content, dict):
                        return [content]
                # Single object response
                return [data]
            elif isinstance(data, list):
                return data
            return []
        except Exception as e:
            logger.error(f"Error downloading file {filename}: {e}")
            raise

    def _generate_mock_telemetry(self, filename: str) -> List[Dict[str, Any]]:
        """
        Generates realistic raw telemetry matching NSCBI schema.
        """
        terminals = ["T1", "T2", "CGO"]
        unit_types = ["PPM", "PPF", "PPD", "STF"]
        payloads = []
        
        # Consistent seed based on filename
        random.seed(hash(filename))
        
        for i in range(1, 11):
            terminal = terminals[i % len(terminals)]
            level = (i % 3) + 1
            ut = unit_types[i % len(unit_types)]
            device_id = f"{terminal}-L{level}-{ut}-00{i}"
            
            payloads.append({
                "deviceId": device_id,
                "temperature": round(random.uniform(22.0, 29.0), 1),
                "humidity": round(random.uniform(40.0, 75.0), 1),
                "pressure": 1013.25,
                "battery": round(random.uniform(3.2, 4.2), 2),
                "rssi": round(random.uniform(-85.0, -45.0), 1),
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "ammonia_ppm": round(random.uniform(2.0, 55.0), 1) if random.random() > 0.1 else None,
                "soap_pct": round(random.uniform(10.0, 100.0), 1) if random.random() > 0.1 else None,
                "paper_pct": round(random.uniform(10.0, 100.0), 1) if random.random() > 0.1 else None,
                "sanitizer_pct": round(random.uniform(10.0, 100.0), 1) if random.random() > 0.1 else None,
                "occupancy_count": random.randint(0, 12) if random.random() > 0.1 else None,
                "cleanliness_score": round(random.uniform(50.0, 100.0), 1) if random.random() > 0.1 else None
            })
            
        return payloads

api_client = AcquisitionClient()
