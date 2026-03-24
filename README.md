# OSINT Earth Platform

A planet-scale OSINT monitoring platform and digital twin of Earth capable of visualizing global activity, detecting anomalies, recording visual evidence, archiving historical events, and replaying global changes through time.

## Features

- **3D Globe** — CesiumJS viewer with terrain, satellite imagery layers, and real-time entity rendering
- **Live Tracking** — Aircraft (OpenSky) and ship (AIS) positions updated every 10–30 seconds via WebSocket
- **Environmental Monitoring** — NASA FIRMS wildfire hotspots, USGS earthquakes, deforestation alerts
- **Event Intelligence** — GDELT news events, ACLED conflict data with geolocation
- **AI Detection** — Object detection (YOLOv8), change detection, anomaly scoring, multi-sensor fusion
- **Visual Evidence** — Automated event snapshot capture with annotations, bounding boxes, and time-series galleries
- **Planet Replay (Earth DVR)** — Rewind and replay global events with play/pause/speed controls
- **Heatmaps** — Wildfire density, seismic activity, shipping density, air traffic
- **Webcam Network** — Thousands of global webcams displayed on the globe with live stream links
- **Offline Mode** — Service Worker + IndexedDB for region pinning, tile pre-download, and offline browsing
- **PWA** — Installable as a standalone desktop/mobile application

## Architecture

```
Data Sources → Python Ingestion Workers → PostGIS Database → Node.js API → CesiumJS Frontend
                     ↓
              AI Detection Modules → Anomaly/Fusion Engine → Snapshot Capture → MinIO Storage
```

## Quick Start

### Prerequisites

- Docker and Docker Compose
- Node.js 20+ (for local frontend development)
- Python 3.12+ (for local worker development)

### Setup

```bash
# Clone the repository
git clone <repo-url> osint-earth-platform
cd osint-earth-platform

# Copy environment template
cp .env.example .env
# Edit .env with your API keys (OpenSky, FIRMS, etc.)

# Start the full stack
cd infrastructure
docker compose up -d

# View logs
docker compose logs -f
```

The platform will be available at:
- **Frontend**: http://localhost (main Nginx), http://localhost:8080 (Docker-built SPA), or http://localhost:5173 (`npm run dev` / Vite)
- **API**: http://localhost:3001
- **MinIO Console**: http://localhost:9001
- **AI Service**: http://localhost:8000/docs

### Local Development

```bash
# Frontend
cd frontend
npm install
npm run dev

# Backend
cd backend
npm install
npm run dev

# Workers
cd workers
pip install -r requirements.txt
python scheduler.py
```

### Seeding Environmental Events & Anomalies (Real Data Only)

To populate `environmental_events` (wildfires, earthquakes) and `anomalies` with **real data**:

```bash
# Python script (real USGS earthquakes, real NASA FIRMS wildfires when key is set)
# Requires: pip install psycopg2 requests; set FIRMS_MAP_KEY for wildfires (free at firms.modaps.eosdis.nasa.gov/api/map_key/)
# Windows: $env:POSTGRES_PORT="5433"; python scripts/seed_environmental_anomalies.py
# Linux/Mac: POSTGRES_PORT=5433 python scripts/seed_environmental_anomalies.py
```

| Data source | How to get real data |
|-------------|----------------------|
| **Earthquakes** | Script fetches from USGS (no API key). |
| **Wildfires** | Set `FIRMS_MAP_KEY` in `.env`; script fetches from NASA FIRMS. Or run workers: `python scheduler.py` with `FIRMS_MAP_KEY` and `WILDFIRE_POLL_MINUTES` set. |
| **Anomalies** | Run the AI service and call `POST /scan` with ship/aircraft/event data in the DB (from workers). Or run `python scripts/seed_environmental_anomalies.py` with the AI service running—it will trigger a scan. |

Port 5433 is used because Docker maps Postgres to that port on the host.

### Layer Architecture (Toggle vs Data)

| Toggle | Data source | When it runs |
|--------|-------------|--------------|
| **Anomalies** | Fetches from DB | Toggle only shows/hides. Data must be populated first by running the AI service and `POST /anomaly/scan`, or by running the Python seed script (which triggers a scan). |
| **Events** | `events` table (GDELT, ACLED) | Separate from wildfires/earthquakes. News and conflict events. |
| **Wildfires / Earthquakes** | `environmental_events` table | NASA FIRMS + USGS. Run seed script or workers. |
| **Fire Density** | Heatmap of wildfire hotspots | Same underlying data as Wildfires, shown as density ellipses. Last 7 days. |
| **Numbers on clusters** | Entity count | When zoomed out, nearby markers cluster. The number is how many entities are in that cluster. Zoom in to see individuals; click for detail panel. |

### Troubleshooting

| Issue | Fix |
|-------|-----|
| **404 on `/api/environmental`, `/api/anomalies`, or `/api/ai/anomaly/scan`** | Rebuild the backend so new routes are included: `cd infrastructure && docker compose build backend && docker compose up -d backend`. For local dev: `cd backend && npm run dev`. |
| **Duplicate `VITE_CESIUM_ION_TOKEN` in .env** | Keep only one. Remove the duplicate line. The last occurrence wins, but duplicates can cause confusion. |
| **Cesium 401 / "Mesh buffer doesn't exist"** | Set a valid `VITE_CESIUM_ION_TOKEN` in `.env` (get one at [ion.cesium.com](https://ion.cesium.com/tokens)). If the token is expired or invalid, terrain will fail; the app falls back to flat terrain. |
| **Empty wildfires/earthquakes** | Run the seed script (see above) or ensure workers have `FIRMS_MAP_KEY` and USGS access configured. |
| **Toggles don't match what's shown** | "Events" = GDELT/ACLED (news, conflict). "Wildfires"/"Earthquakes" = NASA/USGS from a different table. They are separate data sources. Heatmaps show density of the same underlying data. |

## Project Structure

```
osint-earth-platform/
  frontend/             React + CesiumJS + Vite
  backend/              Node.js + Express REST API + WebSocket
  workers/              Python ingestion workers + scheduler
  ai_modules/           FastAPI AI/ML services
  database/             PostGIS schema + migrations + seed data
  infrastructure/       Docker, Nginx, deployment configs
  docs/                 Architecture, API reference, deployment guide
```

## Data Sources

| Source | Type | Update Frequency |
|--------|------|-----------------|
| Sentinel-1/2/3 | Satellite imagery | 6 hours |
| Landsat-8/9 | Satellite imagery | 6 hours |
| GOES-16/18 | Weather satellite | 15 minutes |
| OpenSky Network | Aircraft tracking | 10 seconds |
| AIS (AISHub) | Ship tracking | 30 seconds |
| NASA FIRMS | Wildfire hotspots | 15 minutes |
| USGS Earthquake | Seismic events | 5 minutes |
| GDELT | Global news events | 1 hour |
| ACLED | Conflict data | 1 hour |
| Windy Webcams | Live webcams | Daily |

## API Keys

Most data sources offer free tiers. Required keys:
- **FIRMS_MAP_KEY** — https://firms.modaps.eosdis.nasa.gov/api/area/ (free)
- **WINDY_API_KEY** — https://api.windy.com (free tier available)
- **ACLED_API_KEY** — https://acleddata.com/acleddatanew/wp-content/uploads/dlm_uploads/2019/01/ACLED_Quick-Guide-to-API_2019.pdf (free for researchers)

Optional:
- **OPENSKY_USERNAME/PASSWORD** — https://opensky-network.org (free, higher rate limits)
- **SENTINEL_HUB_CLIENT_ID/SECRET** — https://www.sentinel-hub.com (free trial)
- **VITE_CESIUM_ION_TOKEN** — Your Cesium Ion access token. Get it at [ion.cesium.com/tokens](https://ion.cesium.com/tokens): sign in → create a token (or use the default) → copy it. Paste into `.env` as `VITE_CESIUM_ION_TOKEN=your_token_here`. The "VITE_" prefix is just this project's env var name; Cesium Ion doesn't have a separate "VITE" option.

## Infrastructure Cost

Target: **under £50/month**

| Component | Provider | Cost |
|-----------|----------|------|
| VPS Primary (4 vCPU, 8 GB) | Hetzner CX31 | ~€8.50/month |
| VPS Workers (2 vCPU, 4 GB) | Hetzner CX21 | ~€5/month |
| **Total** | | **~€13.50/month (~£12)** |

Single-node deployment is also supported for tighter budgets.

## License

MIT
