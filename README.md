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
- **Frontend**: http://localhost (via Nginx) or http://localhost:5173 (Vite dev)
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
- **VITE_CESIUM_ION_TOKEN** — https://ion.cesium.com (free tier)

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
