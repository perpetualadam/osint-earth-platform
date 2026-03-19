-- =============================================================================
-- OSINT Earth Platform – PostGIS Schema
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pg_trgm;   -- trigram index for text search

-- ---------------------------------------------------------------------------
-- datasets – registry of all data sources and their sync state
-- ---------------------------------------------------------------------------
CREATE TABLE datasets (
    id            SERIAL PRIMARY KEY,
    name          TEXT NOT NULL UNIQUE,
    provider      TEXT NOT NULL,
    data_type     TEXT NOT NULL,          -- satellite, aircraft, ship, environmental, event, webcam
    update_freq   TEXT,                   -- human-readable: "6h", "10s", "daily"
    api_endpoint  TEXT,
    last_sync     TIMESTAMPTZ,
    config        JSONB DEFAULT '{}',
    active        BOOLEAN DEFAULT TRUE,
    created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- events – generic geospatial events from any source
-- ---------------------------------------------------------------------------
CREATE TABLE events (
    id            BIGSERIAL PRIMARY KEY,
    event_type    TEXT NOT NULL,           -- wildfire, earthquake, conflict, news, custom …
    title         TEXT,
    description   TEXT,
    location      GEOMETRY(Point, 4326),
    bbox          GEOMETRY(Polygon, 4326),
    severity      SMALLINT,               -- 1-5 scale
    source        TEXT NOT NULL,           -- dataset name
    source_id     TEXT,                    -- upstream unique id
    occurred_at   TIMESTAMPTZ NOT NULL,
    metadata      JSONB DEFAULT '{}',
    created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_events_geom       ON events USING GIST (location);
CREATE INDEX idx_events_bbox       ON events USING GIST (bbox);
CREATE INDEX idx_events_time       ON events USING BRIN (occurred_at);
CREATE INDEX idx_events_type_time  ON events (event_type, occurred_at DESC);
CREATE INDEX idx_events_source     ON events (source, source_id);

-- ---------------------------------------------------------------------------
-- satellite_tiles – metadata for cached satellite imagery tiles
-- ---------------------------------------------------------------------------
CREATE TABLE satellite_tiles (
    id              BIGSERIAL PRIMARY KEY,
    satellite       TEXT NOT NULL,          -- sentinel-2, landsat-8, goes-16 …
    band            TEXT,                   -- RGB, NDVI, thermal …
    bbox            GEOMETRY(Polygon, 4326) NOT NULL,
    acquisition_at  TIMESTAMPTZ NOT NULL,
    cloud_cover     REAL,
    tile_url        TEXT NOT NULL,
    resolution_m    REAL,
    zoom_level      SMALLINT,
    tile_x          INTEGER,
    tile_y          INTEGER,
    metadata        JSONB DEFAULT '{}',
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_sat_tiles_bbox ON satellite_tiles USING GIST (bbox);
CREATE INDEX idx_sat_tiles_time ON satellite_tiles USING BRIN (acquisition_at);
CREATE INDEX idx_sat_tiles_sat  ON satellite_tiles (satellite, acquisition_at DESC);
CREATE INDEX idx_sat_tiles_zxy  ON satellite_tiles (zoom_level, tile_x, tile_y);

-- ---------------------------------------------------------------------------
-- aircraft_tracks – partitioned by week for fast time-range queries
-- ---------------------------------------------------------------------------
CREATE TABLE aircraft_tracks (
    id          BIGSERIAL,
    icao24      TEXT NOT NULL,
    callsign    TEXT,
    origin      TEXT,
    destination TEXT,
    location    GEOMETRY(Point, 4326) NOT NULL,
    altitude    REAL,
    velocity    REAL,
    heading     REAL,
    on_ground   BOOLEAN DEFAULT FALSE,
    recorded_at TIMESTAMPTZ NOT NULL,
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (id, recorded_at)
) PARTITION BY RANGE (recorded_at);

-- Create partitions for current + next 4 weeks (extend in migration)
DO $$
DECLARE
    week_start DATE := date_trunc('week', NOW())::DATE;
    i INT;
BEGIN
    FOR i IN 0..4 LOOP
        EXECUTE format(
            'CREATE TABLE IF NOT EXISTS aircraft_tracks_%s PARTITION OF aircraft_tracks
             FOR VALUES FROM (%L) TO (%L)',
            to_char(week_start + (i * 7), 'YYYYMMDD'),
            week_start + (i * 7),
            week_start + ((i + 1) * 7)
        );
    END LOOP;
END $$;

CREATE INDEX idx_aircraft_geom ON aircraft_tracks USING GIST (location);
CREATE INDEX idx_aircraft_time ON aircraft_tracks USING BRIN (recorded_at);
CREATE INDEX idx_aircraft_icao ON aircraft_tracks (icao24, recorded_at DESC);

-- ---------------------------------------------------------------------------
-- ship_tracks – partitioned by week
-- ---------------------------------------------------------------------------
CREATE TABLE ship_tracks (
    id          BIGSERIAL,
    mmsi        TEXT NOT NULL,
    vessel_name TEXT,
    vessel_type TEXT,
    location    GEOMETRY(Point, 4326) NOT NULL,
    speed       REAL,
    course      REAL,
    heading     REAL,
    nav_status  TEXT,
    recorded_at TIMESTAMPTZ NOT NULL,
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (id, recorded_at)
) PARTITION BY RANGE (recorded_at);

DO $$
DECLARE
    week_start DATE := date_trunc('week', NOW())::DATE;
    i INT;
BEGIN
    FOR i IN 0..4 LOOP
        EXECUTE format(
            'CREATE TABLE IF NOT EXISTS ship_tracks_%s PARTITION OF ship_tracks
             FOR VALUES FROM (%L) TO (%L)',
            to_char(week_start + (i * 7), 'YYYYMMDD'),
            week_start + (i * 7),
            week_start + ((i + 1) * 7)
        );
    END LOOP;
END $$;

CREATE INDEX idx_ship_geom ON ship_tracks USING GIST (location);
CREATE INDEX idx_ship_time ON ship_tracks USING BRIN (recorded_at);
CREATE INDEX idx_ship_mmsi ON ship_tracks (mmsi, recorded_at DESC);

-- ---------------------------------------------------------------------------
-- webcams
-- ---------------------------------------------------------------------------
CREATE TABLE webcams (
    id            SERIAL PRIMARY KEY,
    name          TEXT NOT NULL,
    location      GEOMETRY(Point, 4326) NOT NULL,
    stream_url    TEXT,
    thumbnail_url TEXT,
    camera_type   TEXT,                    -- live, timelapse, static
    source        TEXT NOT NULL,           -- windy, earthcam, skyline …
    country       TEXT,
    active        BOOLEAN DEFAULT TRUE,
    last_checked  TIMESTAMPTZ,
    metadata      JSONB DEFAULT '{}',
    created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_webcams_geom ON webcams USING GIST (location);

-- ---------------------------------------------------------------------------
-- environmental_events – wildfires, earthquakes, floods, deforestation
-- ---------------------------------------------------------------------------
CREATE TABLE environmental_events (
    id            BIGSERIAL PRIMARY KEY,
    event_type    TEXT NOT NULL,            -- wildfire, earthquake, flood, deforestation
    location      GEOMETRY(Point, 4326),
    bbox          GEOMETRY(Polygon, 4326),
    severity      REAL,                    -- magnitude, FRP, area …
    data_source   TEXT NOT NULL,
    started_at    TIMESTAMPTZ NOT NULL,
    ended_at      TIMESTAMPTZ,
    metadata      JSONB DEFAULT '{}',
    created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_env_geom      ON environmental_events USING GIST (location);
CREATE INDEX idx_env_bbox      ON environmental_events USING GIST (bbox);
CREATE INDEX idx_env_time      ON environmental_events USING BRIN (started_at);
CREATE INDEX idx_env_type_time ON environmental_events (event_type, started_at DESC);

-- ---------------------------------------------------------------------------
-- anomalies – AI-detected anomalies
-- ---------------------------------------------------------------------------
CREATE TABLE anomalies (
    id               BIGSERIAL PRIMARY KEY,
    anomaly_type     TEXT NOT NULL,
    location         GEOMETRY(Point, 4326) NOT NULL,
    score            REAL NOT NULL,
    baseline_value   REAL,
    observed_value   REAL,
    detection_method TEXT NOT NULL,
    related_event_id BIGINT REFERENCES events(id) ON DELETE SET NULL,
    detected_at      TIMESTAMPTZ NOT NULL,
    metadata         JSONB DEFAULT '{}',
    created_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_anomalies_geom ON anomalies USING GIST (location);
CREATE INDEX idx_anomalies_time ON anomalies USING BRIN (detected_at);
CREATE INDEX idx_anomalies_type ON anomalies (anomaly_type, detected_at DESC);

-- ---------------------------------------------------------------------------
-- event_snapshots – visual evidence captures
-- ---------------------------------------------------------------------------
CREATE TABLE event_snapshots (
    id              BIGSERIAL PRIMARY KEY,
    event_id        BIGINT REFERENCES events(id) ON DELETE CASCADE,
    env_event_id    BIGINT REFERENCES environmental_events(id) ON DELETE CASCADE,
    anomaly_id      BIGINT REFERENCES anomalies(id) ON DELETE CASCADE,
    image_url       TEXT NOT NULL,
    thumbnail_url   TEXT,
    annotations     JSONB DEFAULT '{}',
    capture_source  TEXT,                   -- sentinel-2, goes-16 …
    detection_type  TEXT,
    confidence      REAL,
    location        GEOMETRY(Point, 4326),
    captured_at     TIMESTAMPTZ NOT NULL,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_snapshots_event ON event_snapshots (event_id);
CREATE INDEX idx_snapshots_geom  ON event_snapshots USING GIST (location);
CREATE INDEX idx_snapshots_time  ON event_snapshots USING BRIN (captured_at);

-- ---------------------------------------------------------------------------
-- offline_regions – user-pinned regions for offline caching
-- ---------------------------------------------------------------------------
CREATE TABLE offline_regions (
    id            SERIAL PRIMARY KEY,
    name          TEXT,
    bbox          GEOMETRY(Polygon, 4326) NOT NULL,
    zoom_min      SMALLINT DEFAULT 1,
    zoom_max      SMALLINT DEFAULT 14,
    time_start    TIMESTAMPTZ,
    time_end      TIMESTAMPTZ,
    tile_count    INTEGER,
    size_bytes    BIGINT,
    status        TEXT DEFAULT 'pending',  -- pending, downloading, ready, error
    created_at    TIMESTAMPTZ DEFAULT NOW(),
    last_synced   TIMESTAMPTZ
);

CREATE INDEX idx_offline_bbox ON offline_regions USING GIST (bbox);
