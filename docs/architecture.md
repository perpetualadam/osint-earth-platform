# Architecture

## System Overview

The OSINT Earth Platform follows a six-layer architecture:

1. **Data Sources** — External APIs and feeds providing satellite imagery, aircraft/ship positions, environmental data, news events, and webcam streams
2. **Ingestion Workers** — Python services that poll APIs on configurable intervals, normalize data, and insert into PostGIS
3. **Data Normalization** — Geospatial standardisation to WGS84/EPSG:4326, temporal alignment, deduplication
4. **AI Processing** — Object detection, change detection, anomaly scoring, and multi-sensor fusion
5. **Geospatial Database** — PostgreSQL + PostGIS with spatial indexing, temporal partitioning, and JSONB metadata
6. **Visualization Frontend** — React + CesiumJS 3D globe with layer management, timeline controls, replay engine, and offline support

## Component Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                        DATA SOURCES                         │
│  Sentinel  Landsat  GOES  OpenSky  AIS  FIRMS  USGS  ...   │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────┐
│                   INGESTION WORKERS (Python)                │
│  satellite  aircraft  ship  wildfire  earthquake  webcam    │
│  event  │ APScheduler orchestration                         │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────┐
│               STORAGE LAYER                                 │
│  PostgreSQL + PostGIS    Redis (cache/pub-sub)              │
│  MinIO (object storage)  Nginx (tile cache)                 │
└────┬─────────────────────┬──────────────────────────────────┘
     │                     │
┌────▼─────────┐   ┌──────▼──────────────────────────────────┐
│  AI SERVICE  │   │         BACKEND API (Node.js)            │
│  (FastAPI)   │   │  REST endpoints + Socket.io WebSocket    │
│  Detection   │   │  Events, Tiles, Tracks, Webcams,         │
│  Change Det  │   │  Snapshots, Heatmaps, Replay, Offline    │
│  Anomaly     │   └──────────────────┬───────────────────────┘
│  Fusion      │                      │
└──────────────┘   ┌──────────────────▼───────────────────────┐
                   │        FRONTEND (React + CesiumJS)       │
                   │  GlobeViewer  LayerManager  Timeline     │
                   │  ReplayControls  EventPanel  Gallery     │
                   │  OfflinePanel  ConnectionStatus          │
                   │  Service Worker + IndexedDB (offline)    │
                   └──────────────────────────────────────────┘
```

## Data Flow

### Real-Time Pipeline

1. Worker polls external API (e.g., OpenSky every 10s)
2. Worker normalises response into PostGIS-compatible format
3. Worker inserts rows into PostGIS tables
4. Worker publishes GeoJSON to Redis channel (`aircraft:live`)
5. Backend API relays Redis pub/sub messages to WebSocket clients
6. Frontend CesiumJS viewer updates entity positions in real time

### Event Detection Pipeline

1. Environmental worker inserts wildfire/earthquake event
2. Snapshot engine captures satellite tile for location
3. AI anomaly scanner runs periodic scans
4. Multi-sensor fusion correlates events across sources
5. Confirmed events get time-series snapshot captures (t+10m, t+30m, t+1h, …)

### Replay Pipeline

1. User selects bbox + time range + speed
2. Frontend requests `/api/replay/frames`
3. Backend queries events, aircraft, ships, environmental data per time step
4. Returns ordered frame descriptors
5. Frontend iterates frames, updating CesiumJS clock and entities

## Database Design

### Partitioning Strategy

`aircraft_tracks` and `ship_tracks` are range-partitioned by `recorded_at` (weekly partitions). This keeps per-partition index sizes small and enables fast temporal queries.

### Spatial Indexing

All geometry columns use GIST indexes. The query pattern is:
```sql
ST_Intersects(location, ST_MakeEnvelope(west, south, east, north, 4326))
```

### Temporal Indexing

BRIN indexes on timestamp columns provide efficient range scans with minimal storage overhead.

## Offline Architecture

- **Service Worker** intercepts all fetch requests
- **Cache-first** for tiles (Cache API)
- **Network-first** for API data, falling back to IndexedDB
- **Region pinning** pre-downloads tile sets + event data for a user-defined bbox
- **Data export/import** as ZIP archives for transfer between machines
