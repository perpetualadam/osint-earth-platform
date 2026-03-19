import os
from dotenv import load_dotenv

load_dotenv()

POSTGRES = {
    "host": os.getenv("POSTGRES_HOST", "localhost"),
    "port": int(os.getenv("POSTGRES_PORT", "5432")),
    "dbname": os.getenv("POSTGRES_DB", "osint_earth"),
    "user": os.getenv("POSTGRES_USER", "osint"),
    "password": os.getenv("POSTGRES_PASSWORD", "changeme_postgres_password"),
}

REDIS_URL = f"redis://:{os.getenv('REDIS_PASSWORD', '')}@{os.getenv('REDIS_HOST', 'localhost')}:{os.getenv('REDIS_PORT', '6379')}/0"

MINIO = {
    "endpoint": f"{os.getenv('MINIO_ENDPOINT', 'localhost')}:{os.getenv('MINIO_PORT', '9000')}",
    "access_key": os.getenv("MINIO_ROOT_USER", "osint_minio"),
    "secret_key": os.getenv("MINIO_ROOT_PASSWORD", "changeme_minio_password"),
    "secure": False,
}

LOG_LEVEL = os.getenv("WORKER_LOG_LEVEL", "INFO")

OPENSKY_USERNAME = os.getenv("OPENSKY_USERNAME", "")
OPENSKY_PASSWORD = os.getenv("OPENSKY_PASSWORD", "")
FIRMS_MAP_KEY = os.getenv("FIRMS_MAP_KEY", "")
ACLED_API_KEY = os.getenv("ACLED_API_KEY", "")
ACLED_EMAIL = os.getenv("ACLED_EMAIL", "")
WINDY_API_KEY = os.getenv("WINDY_API_KEY", "")
SENTINEL_HUB_CLIENT_ID = os.getenv("SENTINEL_HUB_CLIENT_ID", "")
SENTINEL_HUB_CLIENT_SECRET = os.getenv("SENTINEL_HUB_CLIENT_SECRET", "")
