# API Reference

Base URL: `http://localhost:3001/api`

## Health Check

```
GET /api/health
```
Returns `{ "status": "ok", "db": "connected" }`.

---

## Events

### List Events
```
GET /api/events?bbox=-180,-90,180,90&time_start=2024-01-01&time_end=2024-12-31&event_type=wildfire&limit=500&offset=0
```
Returns GeoJSON FeatureCollection.

### Get Event
```
GET /api/events/:id
```

### Get Event Snapshots
```
GET /api/events/:id/snapshots
```

### Get Event Timeline
```
GET /api/events/:id/timeline
```
Returns ordered snapshots for time-series display.

---

## Satellite Tiles

### Available Tiles
```
GET /api/tiles/available?satellite=sentinel-2&time_start=2024-01-01&bbox=-10,35,30,60
```

### Get Tile Image
```
GET /api/tiles/:satellite/:z/:x/:y
```
Returns WebP image. Cached by Nginx (24h) and Redis (1h).

---

## Aircraft Tracking

### Live Aircraft
```
GET /api/aircraft?bbox=-180,-90,180,90&live=true
```
Returns GeoJSON FeatureCollection with latest position per aircraft.

### Aircraft History
```
GET /api/aircraft/:icao24/history?time_start=2024-01-01&time_end=2024-01-02
```

---

## Ship Tracking

### Live Ships
```
GET /api/ships?bbox=-180,-90,180,90&live=true
```

### Ship History
```
GET /api/ships/:mmsi/history?time_start=2024-01-01&time_end=2024-01-02
```

---

## Webcams

### List Webcams
```
GET /api/webcams?bbox=-10,35,30,60&source=windy
```

### Get Stream URL
```
GET /api/webcams/:id/stream
```

---

## Heatmaps

```
GET /api/heatmaps/:type
```
Types: `wildfires`, `earthquakes`, `shipping`, `air_traffic`, `environmental`.

Returns `{ "type": "...", "points": [{ "lng": ..., "lat": ..., "weight": ... }] }`.

---

## Replay

### Get Replay Frames
```
GET /api/replay/frames?bbox=-10,35,30,60&time_start=2024-01-01&time_end=2024-01-02&step_minutes=60
```
Returns ordered frame descriptors containing events, aircraft, ships, and environmental data per timestamp.

---

## Snapshots

### List Snapshots
```
GET /api/snapshots?event_id=123&detection_type=wildfire&bbox=-10,35,30,60
```

### Get Snapshot Image
```
GET /api/snapshots/:id/image
```

---

## Offline

### Request Cache Manifest
```
POST /api/offline/package
Content-Type: application/json

{
  "bbox": [-10, 35, 30, 60],
  "time_start": "2024-01-01",
  "time_end": "2024-12-31",
  "zoom_min": 1,
  "zoom_max": 14
}
```
Returns manifest of all URLs to pre-cache.

### Export Region Data
```
GET /api/offline/export?bbox=-10,35,30,60&time_start=2024-01-01&time_end=2024-12-31
```
Streams a ZIP archive containing events.json, environmental.json, webcams.json, and manifest.json.

---

## WebSocket

Connect to `ws://localhost:3001` (Socket.io).

### Channels

| Channel | Payload | Description |
|---------|---------|-------------|
| `aircraft:live` | GeoJSON FeatureCollection | Live aircraft positions |
| `ships:live` | GeoJSON FeatureCollection | Live ship positions |
| `events:new` | Event object | New event or snapshot |
| `anomalies:new` | Anomaly object | Newly detected anomaly |

---

## AI Service

Base URL: `http://localhost:8000`

### Object Detection
```
POST /detect/objects
Content-Type: multipart/form-data

file: <image>
confidence: 0.3
lng: -10.5
lat: 51.5
```

### Change Detection
```
POST /change/detect
Content-Type: multipart/form-data

image_t1: <earlier image>
image_t2: <later image>
threshold: 30.0
min_area_px: 100
```

### Anomaly Scan
```
POST /anomaly/scan?anomaly_type=all&hours=6
```

### Multi-Sensor Fusion
```
POST /fusion/correlate?hours=6&radius_km=50
```
