# Complete Setup Requirements

Everything needed to run the OSINT Earth Platform locally and deploy it online.

---

## 1. Software Prerequisites (Local Development)

| Software | Version | Purpose | Download |
|----------|---------|---------|----------|
| **Docker Desktop** | 4.x+ | Runs all services via docker-compose | https://www.docker.com/products/docker-desktop |
| **Docker Compose** | v2+ | Bundled with Docker Desktop | (included) |
| **Node.js** | 20 LTS+ | Backend API + Frontend build | https://nodejs.org |
| **npm** | 10+ | Package management (ships with Node.js) | (included) |
| **Python** | 3.12+ | Workers + AI modules | https://www.python.org |
| **pip** | 24+ | Python package management | (included with Python) |
| **Git** | 2.x+ | Version control | https://git-scm.com |

### Optional but Recommended
| Software | Purpose |
|----------|---------|
| **PostgreSQL client** (`psql`) | Direct DB inspection |
| **MinIO Client** (`mc`) | Object storage management |
| **Redis CLI** (`redis-cli`) | Cache inspection |

---

## 2. API Keys and Accounts

### Required for Core Functionality

| Key | Source | Cost | Used By | How to Get |
|-----|--------|------|---------|------------|
| **FIRMS_MAP_KEY** | NASA FIRMS | Free | Wildfire worker | Register at https://firms.modaps.eosdis.nasa.gov/api/area/ — instant approval |

### Recommended (Free Tiers)

| Key | Source | Cost | Used By | How to Get |
|-----|--------|------|---------|------------|
| **OPENSKY_USERNAME** | OpenSky Network | Free | Aircraft worker (higher rate limits) | Register at https://opensky-network.org/index.php/login |
| **OPENSKY_PASSWORD** | OpenSky Network | Free | Aircraft worker | Same as above |
| **WINDY_API_KEY** | Windy.com | Free (1000 req/day) | Webcam worker | https://api.windy.com |
| **VITE_CESIUM_ION_TOKEN** | Cesium Ion | Free (75K tiles/month) | 3D terrain, Sentinel-2 imagery | Go to https://ion.cesium.com/tokens → sign in → create a token (or use default) → copy it → put in .env as `VITE_CESIUM_ION_TOKEN=your_token`. For Sentinel-2: add asset 3954 at https://cesium.com/ion/assetdepot/3954 |

### Optional (Unlock Additional Data)

| Key | Source | Cost | Used By | How to Get |
|-----|--------|------|---------|------------|
| **ACLED_API_KEY** | ACLED | Free for researchers | Conflict event worker | Apply at https://acleddata.com/data-export-tool/ |
| **ACLED_EMAIL** | ACLED | Free | Conflict event worker | Same as above |
| **SENTINEL_HUB_CLIENT_ID** | Sentinel Hub | Free trial (30 days) | Enhanced satellite imagery | Register at https://www.sentinel-hub.com |
| **SENTINEL_HUB_CLIENT_SECRET** | Sentinel Hub | Free trial | Enhanced satellite imagery | Same as above |

### Sources That Need NO Keys

| Source | Worker | Notes |
|--------|--------|-------|
| USGS Earthquake API | earthquake_worker | Completely open, no auth |
| GDELT Project | event_worker | Completely open, no auth |
| Copernicus Data Space catalog | satellite_worker | Metadata queries are open |
| OpenStreetMap tiles | Frontend base map | Free, respect usage policy |
| AISHub (demo) | ship_worker | Demo key included, limited data |

---

## 3. Environment Variables

Copy `.env.example` to `.env` and fill in:

```
# MUST CHANGE (security)
POSTGRES_PASSWORD=<strong random password>
REDIS_PASSWORD=<strong random password>
MINIO_ROOT_PASSWORD=<strong random password>
JWT_SECRET=<strong random string>

# API Keys (fill in what you have)
FIRMS_MAP_KEY=<your NASA FIRMS key>
OPENSKY_USERNAME=<optional>
OPENSKY_PASSWORD=<optional>
WINDY_API_KEY=<optional>
VITE_CESIUM_ION_TOKEN=<optional>
ACLED_API_KEY=<optional>
ACLED_EMAIL=<optional>
SENTINEL_HUB_CLIENT_ID=<optional>
SENTINEL_HUB_CLIENT_SECRET=<optional>

# Usually leave as defaults
POSTGRES_DB=osint_earth
POSTGRES_USER=osint
API_PORT=3001
CORS_ORIGINS=http://localhost:8080,http://localhost:5173,http://localhost:3000
```

---

## 4. Local Startup (Docker — Easiest)

```bash
cd osint-earth-platform
cp .env.example .env
# Edit .env with passwords and API keys

cd infrastructure
docker compose up -d

# Check status
docker compose ps
docker compose logs -f
```

Services available after startup:

| Service | URL | Purpose |
|---------|-----|---------|
| Frontend (Docker SPA) | http://localhost:8080 | CesiumJS 3D globe (compose maps host 8080 → container 80) |
| Frontend (Vite dev) | http://localhost:5173 | Local dev with HMR (`npm run dev` in `frontend/`) |
| Backend API | http://localhost:3001/api/health | REST API |
| Nginx Proxy | http://localhost | Reverse proxy (production-like) |
| MinIO Console | http://localhost:9001 | Object storage UI |
| AI Service | http://localhost:8000/docs | FastAPI docs (Swagger) |
| PostgreSQL | localhost:5432 | Direct DB access |
| Redis | localhost:6379 | Cache inspection |

---

## 5. Local Startup (Without Docker — Manual)

### a. PostgreSQL + PostGIS

```bash
# Install PostgreSQL 16 + PostGIS extension
# Create database
createdb osint_earth
psql osint_earth -c "CREATE EXTENSION postgis;"
psql osint_earth -f database/schema.sql
psql osint_earth -f database/seed.sql
```

### b. Redis

```bash
# Install Redis 7
redis-server --requirepass your_password
```

### c. MinIO

```bash
# Install MinIO
minio server ./data --console-address ":9001"
# Create buckets: tiles, snapshots, exports
```

### d. Backend API

```bash
cd backend
npm install
npm run dev
```

### e. Frontend

```bash
cd frontend
npm install
npm run dev
```

### f. Workers

```bash
cd workers
pip install -r requirements.txt
python scheduler.py
```

### g. AI Service

```bash
cd ai_modules
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8000
```

---

## 6. Running Tests

### Backend API Tests
```bash
cd backend
npm install
# Start the API server first, then:
npm test
```

### Frontend Unit Tests
```bash
cd frontend
npm install
npm test
```

### Python Worker Tests
```bash
cd workers
pip install -r requirements.txt
pip install pytest
python -m pytest tests/ -v
```

### AI Module Tests
```bash
cd ai_modules
pip install -r requirements.txt
pip install pytest
python -m pytest tests/ -v
```

---

## 7. Production Deployment

### Infrastructure Options

| Provider | Plan | Specs | Cost |
|----------|------|-------|------|
| **Hetzner CX31** | Primary node | 4 vCPU, 8 GB RAM, 80 GB | ~€8.50/month |
| **Hetzner CX21** | Worker node | 2 vCPU, 4 GB RAM, 40 GB | ~€5/month |
| **Total** | | | **~€13.50/month (~£12)** |

### Alternative Providers (Budget)

| Provider | Plan | Cost |
|----------|------|------|
| Oracle Cloud | Always Free (ARM, 4 vCPU, 24 GB) | £0 |
| DigitalOcean | Basic Droplet (2 vCPU, 4 GB) | ~$24/month |
| Vultr | Cloud Compute (2 vCPU, 4 GB) | ~$24/month |
| Linode | Shared 4 GB | ~$24/month |

### Deployment Steps

1. Provision VPS with Ubuntu 22.04+
2. Install Docker: `curl -fsSL https://get.docker.com | sh`
3. Clone repo and configure `.env`
4. `cd infrastructure && docker compose up -d`
5. Set up domain + Nginx TLS (see `docs/deployment.md`)
6. Set up Certbot for free HTTPS

### DNS Requirements
- 1 A record pointing to your VPS IP
- Optional: subdomain for API (e.g., `api.yourdomain.com`)

---

## 8. Disk Space Requirements

| Data | Estimated Size (30 days) |
|------|--------------------------|
| PostgreSQL database | 2–10 GB |
| Aircraft track data | 1–5 GB/month |
| Ship track data | 0.5–2 GB/month |
| Satellite tile cache | 1–20 GB (depends on zoom levels cached) |
| Event snapshots | 0.5–5 GB/month |
| Redis cache | 256 MB (configured limit) |
| Docker images | ~4 GB |
| **Total** | **~10–40 GB** |

Recommended: 80 GB SSD minimum.

---

## 9. Network/Firewall

### Ports to Open (Production)

| Port | Service | Expose? |
|------|---------|---------|
| 80 | Nginx (HTTP) | Yes |
| 443 | Nginx (HTTPS) | Yes |
| 22 | SSH | Yes (restricted) |
| 5432 | PostgreSQL | No (internal only) |
| 6379 | Redis | No (internal only) |
| 9000 | MinIO | No (internal only) |
| 9001 | MinIO Console | Optional (admin only) |
| 3001 | Backend API | No (behind Nginx) |
| 8000 | AI Service | No (internal only) |

### Outbound Connections Required

| Destination | Port | Purpose |
|-------------|------|---------|
| opensky-network.org | 443 | Aircraft data |
| data.aishub.net | 443 | Ship data |
| firms.modaps.eosdis.nasa.gov | 443 | Wildfire data |
| earthquake.usgs.gov | 443 | Earthquake data |
| api.gdeltproject.org | 443 | News events |
| api.acleddata.com | 443 | Conflict data |
| api.windy.com | 443 | Webcam data |
| catalogue.dataspace.copernicus.eu | 443 | Satellite metadata |
| tile.openstreetmap.org | 443 | Base map tiles |

---

## 10. Quick Validation Checklist

After starting all services, verify:

```bash
# 1. Database is up and schema loaded
curl http://localhost:3001/api/health
# Expected: {"status":"ok","db":"connected"}

# 2. AI service is running
curl http://localhost:8000/health
# Expected: {"status":"ok","service":"ai"}

# 3. Events endpoint works
curl http://localhost:3001/api/events?limit=1
# Expected: {"type":"FeatureCollection","features":[...]}

# 4. Heatmap endpoint works
curl http://localhost:3001/api/heatmaps/wildfires
# Expected: {"type":"wildfires","points":[...]}

# 5. Replay endpoint validates params
curl http://localhost:3001/api/replay/frames
# Expected: 400 with error message

# 6. Offline manifest works
curl -X POST http://localhost:3001/api/offline/package \
  -H "Content-Type: application/json" \
  -d '{"bbox":[-10,35,30,60],"zoom_min":1,"zoom_max":3}'
# Expected: JSON with tile_count, urls array

# 7. Frontend loads
# Open http://localhost:8080 (Docker SPA) or http://localhost:5173 (Vite dev) — should see 3D globe

# 8. MinIO has buckets
curl http://localhost:9000/minio/health/live
# Expected: 200
```

---

## 11. Troubleshooting

| Issue | Solution |
|-------|----------|
| Database connection refused | Check PostgreSQL is running: `docker compose logs postgres` |
| PostGIS extension not found | Schema auto-installs it — check `docker-entrypoint-initdb.d` mount |
| Workers crash on startup | Check `.env` for correct POSTGRES_HOST (use `postgres` in Docker, `localhost` outside) |
| No aircraft data | OpenSky free tier rate-limits to ~100 req/day without account |
| No wildfire data | FIRMS_MAP_KEY is required — register for free key |
| CesiumJS shows blank globe | Check VITE_CESIUM_ION_TOKEN or use OSM base layer (default) |
| MinIO buckets missing | `init-minio.sh` runs on first startup — check `docker compose logs minio-init` |
| Frontend proxy errors | Ensure backend is running on port 3001 before starting frontend |
