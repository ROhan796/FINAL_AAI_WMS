from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import Optional, List

class Settings(BaseSettings):
    NSCBI_API_BASE_URL: str = "https://api.nscbiairport.com/api"
    NSCBI_API_KEY: str = "your_api_key_here"
    NSCBI_DEVICE_IDS: str = ""  # Comma-separated device IDs, e.g. "T1-L1-PPM-001,T2-L2-PPF-002"
    POLLING_INTERVAL_SECONDS: int = 30
    RATE_LIMIT_PER_MINUTE: int = 60
    DA_ENGINE_HOST: str = "0.0.0.0"
    DA_ENGINE_PORT: int = 8001
    ENVIRONMENT: str = "development"
    LOG_LEVEL: str = "INFO"
    DEFAULT_WASHROOM_CAPACITY: int = 10
    CACHE_TTL_SECONDS: int = 60
    WHI_HISTORY_BUFFER_SIZE: int = 100

    # Redis configuration for persistent cache
    REDIS_HOST: str = "localhost"
    REDIS_PORT: int = 6379
    REDIS_DB: int = 0
    REDIS_PASSWORD: str = ""
    REDIS_CACHE_TTL: int = 300  # 5 minutes for cached telemetry
    REDIS_URL: Optional[str] = None  # Override: use full URL when set (e.g. rediss:// for TLS)

    # CORS
    CORS_ORIGINS: str = "http://localhost:3000"

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore"
    )

    @property
    def device_id_list(self) -> List[str]:
        """Parse comma-separated device IDs into a list."""
        if not self.NSCBI_DEVICE_IDS:
            return []
        return [d.strip() for d in self.NSCBI_DEVICE_IDS.split(",") if d.strip()]

    @property
    def redis_url(self) -> str:
        """Build Redis connection URL. Uses REDIS_URL if set, otherwise constructs from components."""
        if self.REDIS_URL:
            return self.REDIS_URL
        auth = f":{self.REDIS_PASSWORD}@" if self.REDIS_PASSWORD else ""
        return f"redis://{auth}{self.REDIS_HOST}:{self.REDIS_PORT}/{self.REDIS_DB}"

settings = Settings()
