import os
import urllib.parse
from pydantic_settings import BaseSettings


def get_secret(name: str, default: str | None = None) -> str | None:
    """
    3-tier secret resolution:
    1. {NAME}_FILE env var → read file contents (Docker secrets pattern)
    2. /run/secrets/{name} (Docker secrets default path)
    3. Direct {NAME} env var (cloud/Render mode)
    4. Default value
    """
    env_key = name.upper()
    secret_file = os.environ.get(f"{env_key}_FILE")
    if not secret_file:
        secret_file = f"/run/secrets/{name.lower()}"
    if os.path.exists(secret_file):
        try:
            with open(secret_file, "r") as f:
                return f.read().strip()
        except Exception:
            pass
    direct_val = os.environ.get(env_key)
    if direct_val:
        return direct_val
    return default


class Settings(BaseSettings):
    PROJECT_NAME: str = "AAI Intelligent Washroom Monitoring"
    APP_ENV: str = "production"

    # ── MQTT / EMQX ──
    MQTT_HOST: str = "localhost"
    MQTT_PORT: int = 1883
    MQTT_USER: str | None = None
    MQTT_PASSWORD: str | None = None
    MQTT_USE_TLS: bool = False
    MQTT_CA_CERT_PATH: str | None = None
    MQTT_CLIENT_CERT_PATH: str | None = None
    MQTT_CLIENT_KEY_PATH: str | None = None
    MQTT_WS_PORT: int = 8084

    # EMQX Dashboard / API
    EMQX_API_ENDPOINT: str = ""
    EMQX_API_KEY: str = ""
    EMQX_API_SECRET: str = ""

    # ── Redis ──
    REDIS_URL: str = ""
    REDIS_HOST: str = ""
    REDIS_PORT: int = 6379
    REDIS_DB: int = 0
    REDIS_PASSWORD: str = ""

    # ── PostgreSQL / TimescaleDB ──
    POSTGRES_URL: str = ""
    POSTGRES_SUPERUSER_URL: str = ""

    # ── Rate Limiting ──
    RATE_LIMIT_MESSAGES: int = 2
    RATE_LIMIT_WINDOW_SECONDS: int = 60

    # ── WHI Thresholds ──
    DEBOUNCE_THRESHOLD: int = 3
    WHI_CRITICAL_THRESHOLD: float = 30.0
    WHI_WARNING_THRESHOLD: float = 50.0

    # ── CORS ──
    CORS_ORIGINS: str = "*"

    WASHROOM_TERMINAL_MAP: dict[str, str] = {
        "L2_WashroomA": "T1",
        "L2_WashroomB": "T1",
        "L3-WashroomC": "T1",
        "L2_M01": "T1",
        "L2_TestRoom": "T1",
        "L2_WashroomT2": "T2",
    }

    # Prefix-to-terminal mapping for dynamic washroom ID resolution
    TERMINAL_PREFIXES: dict[str, str] = {
        "T1": "T1",
        "T2": "T2",
        "T3": "T3",
    }
    
    @property
    def postgres_connection_url(self) -> str:
        parsed = urllib.parse.urlparse(self.POSTGRES_URL)
        netloc = parsed.netloc
        if "@" in netloc:
            user_pass, host_port = netloc.split("@", 1)
            user = user_pass.split(":", 1)[0]
            if ":" in user_pass:
                _, existing_pass = user_pass.split(":", 1)
                if existing_pass:
                    return self.POSTGRES_URL
            db_pass = get_secret("aai_app_worker_password") or get_secret("postgres_password")
            if db_pass:
                new_netloc = f"{user}:{db_pass}@{host_port}"
                return parsed._replace(netloc=new_netloc).geturl()
        return self.POSTGRES_URL

    @property
    def postgres_superuser_connection_url(self) -> str:
        parsed = urllib.parse.urlparse(self.POSTGRES_SUPERUSER_URL)
        netloc = parsed.netloc
        if "@" in netloc:
            user_pass, host_port = netloc.split("@", 1)
            user = user_pass.split(":", 1)[0]
            if ":" in user_pass:
                _, existing_pass = user_pass.split(":", 1)
                if existing_pass:
                    return self.POSTGRES_SUPERUSER_URL
            db_pass = get_secret("postgres_password")
            if db_pass:
                new_netloc = f"{user}:{db_pass}@{host_port}"
                return parsed._replace(netloc=new_netloc).geturl()
        return self.POSTGRES_SUPERUSER_URL

    @property
    def jwt_secret(self) -> str:
        # Reads raw JWT secret directly (64-char hex string representing 256 bits of entropy)
        key = get_secret("jwt_secret_key")
        if key:
            return key
        raise RuntimeError(
            "JWT_SECRET_KEY is not set. Configure it via environment variable, "
            "Docker secret, or {JWT_SECRET_KEY}_FILE. Never use a hardcoded secret."
        )

    @property
    def jwt_secret_previous(self) -> str | None:
        # Reads the previous JWT secret (for rotation overlap support)
        return get_secret("jwt_secret_key_previous")

    @property
    def redis_connection_url(self) -> str:
        # If REDIS_URL already contains a password (e.g. Upstash rediss://), use it as-is
        parsed = urllib.parse.urlparse(self.REDIS_URL)
        if parsed.username or (parsed.netloc and "@" in parsed.netloc):
            return self.REDIS_URL
        # Otherwise, inject password from secrets file (Docker mode)
        redis_pass = get_secret("redis_password")
        if redis_pass:
            netloc = parsed.netloc
            if "@" in netloc:
                _, host_port = netloc.split("@", 1)
            else:
                host_port = netloc
            new_netloc = f":{redis_pass}@{host_port}"
            return parsed._replace(netloc=new_netloc).geturl()
        return self.REDIS_URL

    class Config:
        env_file = ".env2" if os.getenv("APP_ENV") == "production" else ".env"
        extra = "ignore"

settings = Settings()
