import logging
import time
import json
import psycopg2
import psycopg2.extras
import redis as redis_lib
from minio import Minio
from config import POSTGRES, REDIS_URL, MINIO, LOG_LEVEL


class BaseWorker:
    """
    Abstract base class for all ingestion workers.
    Provides database connection, Redis pub/sub, MinIO client,
    structured logging, and retry logic.
    """

    name = "base"

    def __init__(self):
        self.logger = logging.getLogger(self.name)
        self.logger.setLevel(getattr(logging, LOG_LEVEL, logging.INFO))
        if not self.logger.handlers:
            h = logging.StreamHandler()
            h.setFormatter(logging.Formatter(
                f"%(asctime)s [%(levelname)s] [{self.name}] %(message)s"
            ))
            self.logger.addHandler(h)

        self._conn = None
        self._redis = None
        self._minio = None

    @property
    def conn(self):
        if self._conn is None or self._conn.closed:
            self._conn = psycopg2.connect(**POSTGRES)
            self._conn.autocommit = True
        return self._conn

    @property
    def cursor(self):
        return self.conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    @property
    def redis(self):
        if self._redis is None:
            self._redis = redis_lib.from_url(REDIS_URL, decode_responses=True)
        return self._redis

    @property
    def minio(self):
        if self._minio is None:
            self._minio = Minio(
                MINIO["endpoint"],
                access_key=MINIO["access_key"],
                secret_key=MINIO["secret_key"],
                secure=MINIO["secure"],
            )
        return self._minio

    def publish(self, channel, data):
        """Publish a message to Redis for WebSocket fan-out."""
        self.redis.publish(channel, json.dumps(data, default=str))

    def execute_sql(self, sql, params=None):
        with self.cursor as cur:
            cur.execute(sql, params)
            if cur.description:
                return cur.fetchall()
            return None

    def insert_returning(self, sql, params=None):
        with self.cursor as cur:
            cur.execute(sql, params)
            return cur.fetchone()

    def run_with_retry(self, func, max_retries=3, backoff=2):
        for attempt in range(max_retries):
            try:
                return func()
            except Exception as e:
                wait = backoff ** attempt
                self.logger.warning(
                    "Attempt %d/%d failed: %s. Retrying in %ds…",
                    attempt + 1, max_retries, e, wait,
                )
                time.sleep(wait)
                if attempt == max_retries - 1:
                    self.logger.error("All %d attempts failed.", max_retries)
                    raise

    def run(self):
        """Override in subclass. Called by the scheduler on each tick."""
        raise NotImplementedError

    def health_check(self):
        try:
            self.execute_sql("SELECT 1")
            return True
        except Exception:
            return False
