# Deployment Guide

## Infrastructure Requirements

### Minimum (Single Node)
- 1 VPS: 4 vCPU, 8 GB RAM, 80 GB SSD
- Estimated cost: ~€8.50/month (Hetzner CX31)

### Recommended (Two Nodes)
- **Node 1 (primary)**: PostgreSQL, Redis, MinIO, Nginx, Backend API, Frontend
  - 4 vCPU, 8 GB RAM — Hetzner CX31 (~€8.50/month)
- **Node 2 (workers)**: Python ingestion workers, AI modules
  - 2 vCPU, 4 GB RAM — Hetzner CX21 (~€5/month)
- **Total**: ~€13.50/month (~£12)

## Deployment Steps

### 1. Provision VPS

```bash
# On Hetzner Cloud, DigitalOcean, or similar
# Create an Ubuntu 22.04 server
# Install Docker and Docker Compose
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
```

### 2. Clone and Configure

```bash
git clone <repo-url> osint-earth-platform
cd osint-earth-platform
cp .env.example .env
```

Edit `.env` with your configuration:
- Set strong passwords for PostgreSQL, Redis, MinIO
- Add API keys for data sources (FIRMS, Windy, etc.)
- Set CORS origins for your domain

### 3. Deploy with Docker Compose

```bash
cd infrastructure
docker compose up -d
```

Verify all services are running:
```bash
docker compose ps
docker compose logs -f backend
```

### 4. Verify Health

```bash
curl http://localhost:3001/api/health
# Should return: {"status":"ok","db":"connected"}

curl http://localhost:8000/health
# Should return: {"status":"ok","service":"ai"}
```

### 5. Domain and TLS (Production)

Add to `nginx.conf`:
```nginx
server {
    listen 443 ssl;
    server_name your-domain.com;
    ssl_certificate /etc/letsencrypt/live/your-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;
    # ... rest of config
}
```

Use Certbot for free TLS certificates:
```bash
apt install certbot
certbot certonly --standalone -d your-domain.com
```

## Scaling

### Horizontal Worker Scaling

Run multiple worker containers for higher throughput:
```bash
docker compose up -d --scale workers=3
```

### Database Partitioning

Aircraft and ship tracks are auto-partitioned by week. Extend partitions:
```sql
-- Run monthly to create future partitions
DO $$
DECLARE
    week_start DATE := date_trunc('week', NOW())::DATE + 35;
    i INT;
BEGIN
    FOR i IN 0..8 LOOP
        EXECUTE format(
            'CREATE TABLE IF NOT EXISTS aircraft_tracks_%s PARTITION OF aircraft_tracks
             FOR VALUES FROM (%L) TO (%L)',
            to_char(week_start + (i * 7), 'YYYYMMDD'),
            week_start + (i * 7),
            week_start + ((i + 1) * 7)
        );
    END LOOP;
END $$;
```

### Tile Cache Tuning

Increase Nginx cache size in `nginx.conf`:
```nginx
proxy_cache_path /var/cache/nginx/tiles
    levels=1:2
    keys_zone=tile_cache:50m
    max_size=10g
    inactive=7d;
```

## Backup

### Database
```bash
docker compose exec postgres pg_dump -U osint osint_earth | gzip > backup.sql.gz
```

### MinIO
```bash
docker compose exec minio mc mirror local/tiles /backup/tiles
docker compose exec minio mc mirror local/snapshots /backup/snapshots
```

## Monitoring

### Container Health
```bash
docker compose ps
docker stats
```

### Worker Status
```bash
docker compose logs workers --tail 50
```

### Database Size
```sql
SELECT pg_size_pretty(pg_database_size('osint_earth'));
SELECT relname, pg_size_pretty(pg_total_relation_size(oid))
FROM pg_class WHERE relkind = 'r' ORDER BY pg_total_relation_size(oid) DESC LIMIT 10;
```
