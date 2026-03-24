-- Run on existing DBs: psql -f database/migration_telegram_posts.sql
CREATE TABLE IF NOT EXISTS telegram_posts (
    id                 BIGSERIAL PRIMARY KEY,
    telegram_message_id BIGINT NOT NULL,
    channel_id         BIGINT NOT NULL,
    channel_username   TEXT,
    text               TEXT,
    text_en            TEXT,
    posted_at          TIMESTAMPTZ NOT NULL,
    lon                DOUBLE PRECISION,
    lat                DOUBLE PRECISION,
    location           GEOMETRY(Point, 4326),
    geo_confidence     REAL,
    metadata           JSONB DEFAULT '{}',
    created_at         TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (channel_id, telegram_message_id)
);

CREATE INDEX IF NOT EXISTS idx_telegram_posts_geom ON telegram_posts USING GIST (location);
CREATE INDEX IF NOT EXISTS idx_telegram_posts_time ON telegram_posts USING BRIN (posted_at);
CREATE INDEX IF NOT EXISTS idx_telegram_posts_channel ON telegram_posts (channel_id, posted_at DESC);
