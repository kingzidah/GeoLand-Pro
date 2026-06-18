# GeoLand Pro — Development Setup

## Prerequisites

| Tool | Version | Notes |
|------|---------|-------|
| Node.js | ≥ 18 | `node --version` |
| npm | ≥ 9 | Bundled with Node.js 18 |
| PostgreSQL | ≥ 14 **+ PostGIS 3.x** | See options below |
| Redis | ≥ 6 | See options below |

---

## Option A — Docker (recommended for local dev)

The fastest way to get a correctly configured Postgres + PostGIS + Redis stack:

```bash
# PostgreSQL 16 with PostGIS 3.4
docker run -d \
  --name geolandpro-db \
  -e POSTGRES_DB=geolandpro \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=password \
  -p 5432:5432 \
  postgis/postgis:16-3.4

# Redis 7
docker run -d \
  --name geolandpro-redis \
  -p 6379:6379 \
  redis:7-alpine
```

Verify they are running:

```bash
docker ps
# Both containers should show STATUS = Up
```

## Option B — Native install

**macOS (Homebrew):**
```bash
brew install postgresql@16 postgis redis
brew services start postgresql@16
brew services start redis
createdb geolandpro
```

**Ubuntu / Debian:**
```bash
sudo apt install postgresql-16 postgresql-16-postgis-3 redis-server
sudo systemctl start postgresql redis-server
sudo -u postgres createdb geolandpro
```

**Windows:** Install [PostgreSQL for Windows](https://www.postgresql.org/download/windows/) (includes Stack Builder for PostGIS) then install PostGIS via Stack Builder. Install [Redis for Windows](https://github.com/tporadowski/redis/releases).

---

## Step 1 — Install dependencies

Run once from the monorepo root. npm workspaces installs packages for both `apps/api` and `apps/web` in one shot:

```bash
cd geolandpro
npm install
```

---

## Step 2 — Configure environment variables

```bash
cp apps/api/.env.example  apps/api/.env
cp apps/web/.env.example  apps/web/.env
```

### `apps/api/.env` — required edits

| Variable | What to set |
|----------|------------|
| `DATABASE_URL` | `postgresql://postgres:password@localhost:5432/geolandpro` (match your Docker/native credentials) |
| `JWT_ACCESS_SECRET` | Run the command below — must be ≥ 32 chars |
| `JWT_REFRESH_SECRET` | Run the command again — must be a **different** value |
| `TWILIO_ACCOUNT_SID` | Your Twilio Account SID (starts with `AC`). For local dev without SMS, leave the placeholder — notifications fail silently. |
| `TWILIO_AUTH_TOKEN` | Your Twilio Auth Token |
| `AWS_ACCESS_KEY_ID` | IAM key with S3 write access. For local dev without documents, leave the placeholder — PDF generation will fail but everything else works. |
| `AWS_SECRET_ACCESS_KEY` | Matching IAM secret |
| `AWS_S3_BUCKET` | Name of your S3 bucket |

**Generate JWT secrets** (run twice, use different output each time):
```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

### `apps/web/.env` — default is fine for local dev

```env
VITE_API_URL=
```

Leave `VITE_API_URL` **blank**. The Vite dev server proxies all `/api` requests to `http://localhost:4000`, so no URL is needed locally. Only set it in production (e.g. `https://api.geolandpro.com`).

---

## Step 3 — Run Prisma migrations

From `apps/api/`:

```bash
cd apps/api
npm run prisma:migrate -- --name init
```

Prisma reads your `DATABASE_URL`, connects to PostgreSQL, and:

1. Enables the `postgis` extension
2. Creates all 13 tables (`users`, `properties`, `plots`, `lease_agreements`, `rent_records`, `transactions`, `commissions`, `documents`, `geofence_alerts`, `alert_events`, `geotagged_photos`, `notifications`, `audit_logs`)
3. Applies all foreign key constraints and indexes
4. Generates the typed Prisma client (`node_modules/.prisma/client`)

**Expected output:**
```
Environment variables loaded from .env
Prisma schema loaded from prisma/schema.prisma
Datasource "db": PostgreSQL database "geolandpro"

Applying migration `20240101000000_init`

The following migration(s) have been created and applied from new schema changes:

migrations/
  └─ 20240101000000_init/
    └─ migration.sql

Your database is now in sync with your schema.

✔ Generated Prisma Client
```

> **If it fails with `Permission denied to create extension`:** Your DB user lacks superuser rights.
> Run: `psql -U postgres -c "ALTER ROLE <youruser> SUPERUSER;"` and retry.

---

## Step 4 — Apply PostGIS geometry columns

Prisma's migration created the standard columns. The geometry columns (`boundary geometry(Polygon, 4326)`) and the spatial auto-sync trigger cannot be expressed in Prisma schema — they are in `prisma/migrations/add_postgis_columns.sql`.

Run the companion script:

```bash
npm run db:postgis
```

This calls `prisma/apply-postgis.ts`, which reads the SQL file and executes each statement through Prisma's raw query API. It is **idempotent** — safe to run multiple times.

**What it adds:**

| Table | Column | Type | Index |
|-------|--------|------|-------|
| `plots` | `boundary` | `geometry(Polygon, 4326)` | GIST |
| `properties` | `boundary` | `geometry(MultiPolygon, 4326)` | GIST |
| `geofence_alerts` | `boundary` | `geometry(Polygon, 4326)` | GIST |

**Trigger created:** `trg_sync_plot_boundary`
- Fires on `INSERT` or `UPDATE OF boundaryGeoJSON` on the `plots` table
- Auto-computes `boundary` (PostGIS geometry), `areaSqm` (via `ST_Area`), `centroidLat`, `centroidLng` (via `ST_Centroid`)
- This means you never need to compute these in application code — just write `boundaryGeoJSON` and all spatial fields update atomically

**Expected output:**
```
Applying 8 PostGIS statements...

  ✓  CREATE EXTENSION IF NOT EXISTS postgis;
  ✓  ALTER TABLE plots ADD COLUMN IF NOT EXISTS boundary geometry(Polygon…
  ✓  CREATE INDEX IF NOT EXISTS idx_plots_boundary ON plots USING GIST (b…
  ✓  ALTER TABLE properties ADD COLUMN IF NOT EXISTS boundary geometry(Mul…
  ✓  CREATE INDEX IF NOT EXISTS idx_properties_boundary ON properties USIN…
  ✓  ALTER TABLE geofence_alerts ADD COLUMN IF NOT EXISTS boundary geometr…
  ✓  CREATE INDEX IF NOT EXISTS idx_geofence_alerts_boundary ON geofence_a…
  ✓  CREATE OR REPLACE FUNCTION sync_plot_boundary() RETURNS TRIGGER AS $$…
  ✓  DROP TRIGGER IF EXISTS trg_sync_plot_boundary ON plots;
  ✓  CREATE TRIGGER trg_sync_plot_boundary BEFORE INSERT OR UPDATE OF "bou…

✓  PostGIS migration applied successfully.
```

---

## Step 5 — Seed the database

```bash
npm run prisma:seed
```

Creates 5 users, 1 property, and 3 plots with real GeoJSON boundaries near East Legon, Accra.

**Seed credentials (all passwords: `Password123!`):**

| Role | Email |
|------|-------|
| SUPER_ADMIN | superadmin@geolandpro.com |
| ADMIN | admin@geolandpro.com |
| MANAGER | manager@geolandpro.com |
| FIELD_SURVEYOR | surveyor@geolandpro.com |
| TENANT | tenant@geolandpro.com |

**Seed data:**
- Property: **Accra Residential Estate**, East Legon, managed by admin + manager
- Plots: PLT-001, PLT-002, PLT-003 (all `VACANT`, boundaries drawn as GeoJSON polygons)

> **Note:** The seed is idempotent. Running it twice won't duplicate records — all upserts use the stable `id` or `email` as the lookup key.

---

## Step 6 — Start both servers

Open two terminal windows:

**Terminal 1 — API server:**
```bash
cd apps/api
npm run dev
# Watching for changes via nodemon
# GeoLand Pro API  |  port 4000  |  env: development
```

**Terminal 2 — Web dev server:**
```bash
cd apps/web
npm run dev
# VITE  ready in 800ms
# ➜  Local:   http://localhost:5173/
```

Or run both from the monorepo root in parallel:
```bash
# macOS / Linux
npm run dev:api & npm run dev:web

# Windows PowerShell (two separate terminals or use concurrently)
Start-Process npm -ArgumentList "run dev:api"
npm run dev:web
```

---

## Step 7 — Verify in the browser

1. Open **http://localhost:5173**
2. Log in: `admin@geolandpro.com` / `Password123!`
3. **Dashboard** should load stat cards (0s on fresh DB — that's correct)
4. **Properties → Accra Residential Estate** — the Leaflet map should render with 3 green plot outlines
5. **Tenants** — shows John Tenant
6. **Admin panel** (log in as `superadmin@geolandpro.com`) — shows all 5 seed users

If the map loads and all 5 pages navigate without errors, the full stack is working.

---

## One-liner setup (fresh database)

If you prefer to run all database steps in sequence with a single command:

```bash
cd apps/api
npm run db:setup
```

This chains `prisma:migrate -- --name init` → `db:postgis` → `prisma:seed`.

> Only use this on a **fresh database**. If migrations already exist, use the individual commands instead to avoid Prisma asking you to reset the database interactively.

---

## Troubleshooting

### `DATABASE_URL must be a valid PostgreSQL connection string`
The env validator failed at startup. Check that `apps/api/.env` exists (not just `.env.example`) and that the URL starts with `postgresql://` or `postgres://`.

### `PrismaClientInitializationError: Can't reach database server at localhost:5432`
PostgreSQL isn't running. Start it: `docker start geolandpro-db` (Docker) or `brew services start postgresql@16` (macOS).

### `Error: connect ECONNREFUSED 127.0.0.1:6379`
Redis isn't running. Start it: `docker start geolandpro-redis` or `brew services start redis`.

### `prisma migrate dev` fails with `permission denied to create extension "postgis"`
Your DB user isn't a superuser. Run:
```bash
psql -U postgres -c "ALTER ROLE postgres SUPERUSER;"
# or grant on the specific database:
psql -U postgres -d geolandpro -c "CREATE EXTENSION IF NOT EXISTS postgis;"
```
Then re-run `npm run prisma:migrate -- --name init`.

### `db:postgis` fails with `function st_geomfromgeojson(text) does not exist`
PostGIS extension wasn't enabled. Confirm `CREATE EXTENSION postgis;` ran in `prisma migrate dev` by checking:
```bash
psql -U postgres -d geolandpro -c "SELECT postgis_version();"
```
If it errors, install the PostGIS package for your PostgreSQL version (see Option B above).

### Map shows grey tiles but no plot outlines
The Leaflet container CSS is conflicting with a parent `z-index`. Verify `apps/web/src/index.css` contains:
```css
.leaflet-container { z-index: 0; }
```

### `TWILIO_ACCOUNT_SID must start with AC` at startup
The Zod env validator runs at boot. For local dev without Twilio, use the placeholder from `.env.example` (`ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`) — SMS/WhatsApp will fail at runtime but the server starts.

### Prisma Client is out of sync after a schema change
```bash
cd apps/api
npm run prisma:generate   # regenerates the typed client
```

---

## Environment variable reference

### `apps/api/.env`

```
NODE_ENV              development | test | production
PORT                  API port (default 4000)
DATABASE_URL          postgresql://user:pass@host:5432/dbname
REDIS_URL             redis://localhost:6379
JWT_ACCESS_SECRET     64-byte hex — generate with crypto.randomBytes(64)
JWT_REFRESH_SECRET    64-byte hex — must differ from access secret
JWT_ACCESS_EXPIRES_IN Token TTL (default 15m)
JWT_REFRESH_EXPIRES_IN Refresh TTL (default 7d)
AWS_REGION            e.g. eu-west-1
AWS_ACCESS_KEY_ID     IAM key ID
AWS_SECRET_ACCESS_KEY IAM secret
AWS_S3_BUCKET         S3 bucket name for documents
TWILIO_ACCOUNT_SID    Starts with AC
TWILIO_AUTH_TOKEN     Twilio auth token
TWILIO_PHONE_NUMBER   E.164 format e.g. +233XXXXXXXXX
TWILIO_WHATSAPP_NUMBER whatsapp:+14155238886 (Twilio sandbox or your number)
CORS_ORIGINS          Comma-separated list e.g. http://localhost:5173
COMMISSION_RATE_PERCENT Platform commission % (default 4)
```

### `apps/web/.env`

```
VITE_API_URL          Leave blank for local dev (uses Vite proxy → localhost:4000)
                      Set to https://api.yourdomain.com in production
```
