# GeoLand Pro — 3D Map System Specification

**Classification:** INTERNAL
**Status:** Draft v1.0
**Owner:** Technical Director
**Last updated:** 2026-06-15
**Document location:** `docs/architecture/MAP_3D_SPEC.md`

> This document is the **source of truth** for the 3D mapping subsystem.
> Claude Code must read this file at the start of every map-related session
> and treat it as authoritative over chat memory or prior code.
> Updates to the spec require an ADR entry in `02_GeoLandPro_DecisionLog_ADR.docx`.

---

## 1. Goal

Build a **production-grade 3D land-management map** that:

1. Renders **pin-sharp satellite imagery** at every zoom level (down to ~30 cm/px today, ~5 cm/px on drone-mapped properties later).
2. Shows the property in **true 3D** — terrain shading, extruded plots, sky/atmosphere.
3. Provides a **professional drawing and editing toolkit** — draw, split, merge, snap, vertex-edit, measure, with live area in m² and Ghanaian plot units.
4. **Scales to 100,000+ plots** per organisation without client-side slowdown.
5. Works on a **phone in the field** with GPS and touch input.
6. Is **tenant-isolated and secure** end-to-end (httpOnly cookies, org-scoped tile endpoints).

This is the map subsystem at v1. CesiumJS-based photogrammetry rendering is deferred to v2.0 per the business roadmap. The architecture below leaves a clean swap-in point for it later.

---

## 2. Tech baseline (locked)

| Concern              | Choice                                                                  |
| -------------------- | ----------------------------------------------------------------------- |
| Map engine           | **MapLibre GL JS v3+**                                                  |
| GPU overlay          | **deck.gl 9+** (MapLibre interleaved mode)                              |
| Drawing toolkit      | **Terra Draw** (MapLibre-native, modern fork of mapbox-gl-draw)         |
| Geodesic math        | **@turf/turf** (area, distance, bbox, booleanIntersects, kinks)         |
| Vector tile server   | **PostGIS `ST_AsMVT`** through Express endpoint                         |
| Raster tile services | ESRI World Imagery, Sentinel-2 cloudless, MapTiler terrain-rgb, titiler |
| State                | Redux Toolkit (`features/map` slice)                                    |
| Data fetching        | `fetch` with `credentials: 'include'` — httpOnly cookies only           |

No Mapbox GL JS (licence). No Cesium yet (premature).

---

## 3. Imagery strategy — how we get "chippy clear"

Sharpness is a stack of decisions, not a single setting. We hit it on three fronts:

### 3.1 Layered base imagery

Loaded in order of preference; client picks the highest-res source available for the current viewport:

| Source                                                   | Resolution        | Coverage          | Cost          | Use                                  |
| -------------------------------------------------------- | ----------------- | ----------------- | ------------- | ------------------------------------ |
| **Per-tenant drone orthophotos (COG on S3)**             | 2–5 cm/px         | Surveyed property | Paid once     | Default once a property is surveyed  |
| **ESRI World Imagery**                                   | ~30 cm/px (urban) | Global            | Free          | Default for most of Ghana            |
| **Sentinel-2 cloudless**                                 | 10 m/px           | Global            | Free          | Wide context, time-series, fallback  |
| **Bing/Maxar (licensed)**                                | Variable          | Global            | Paid          | Optional v2 if budget allows         |

The client uses a **`source-priority` selector**: if a drone-ortho COG is available for the active property, it's drawn on top of ESRI within the property bounds. Outside the property, ESRI shows. Beyond z14, Sentinel-2 is the wide-area fallback.

### 3.2 High-DPI handling

- All raster sources are declared with `tileSize: 256` and **MapLibre's `pixelRatio` auto-handling** for retina displays.
- The CSS rule `image-rendering: crisp-edges` is applied to the map canvas at zoom ≥ 19 to stop the browser from blurring upscaled pixels.
- Drone COGs are served as **WebP at quality 90** through titiler, retina-doubled where the COG has the resolution to support it.

### 3.3 Drone orthophoto pipeline (COG + titiler)

This is where "centimetre-precision" comes from.

1. Field drone (rented locally, per the budget doc) produces a GeoTIFF after photogrammetric processing in OpenDroneMap or WebODM.
2. Convert to **Cloud-Optimised GeoTIFF**: `rio cogeo create input.tif output.tif --web-optimized --add-mask`.
3. Upload to S3 under `s3://glp-orthophotos/<orgId>/<propertyId>/<surveyDate>.tif`.
4. Register in DB table `property_orthophotos (id, property_id, organisation_id, s3_key, captured_at, bounds geometry, gsd_cm)`.
5. Serve through **titiler** (FastAPI sidecar, deployed alongside the API) at `/tiles/ortho/{orthoId}/{z}/{x}/{y}.webp`, with a signed CloudFront URL valid for the session.
6. Client loads it as a `raster` source the moment the user picks a property that has one.

---

## 4. Plot data delivery — vector tiles, not GeoJSON

GeoJSON works fine for ≤5,000 plots; it's the wrong tool for a SaaS that will scale across 100+ properties. Replace it with **Mapbox Vector Tiles generated on the fly by PostGIS**.

### 4.1 Endpoint

`GET /api/tiles/plots/{z}/{x}/{y}.pbf`

- Auth: `requireAuth` middleware (httpOnly cookie).
- Tenancy: `resolveTenancy` middleware sets `req.organisationId`; the SQL filters by it. Platform admins can pass `?organisationId=` (and only platform admins).
- Cache headers: `Cache-Control: private, max-age=60`. **Private** is critical — never let a shared CDN cache a tenant tile.

### 4.2 SQL (template)

```sql
WITH bounds AS (
  SELECT ST_TileEnvelope($z, $x, $y) AS env
),
mvt_geom AS (
  SELECT
    p.id,
    p.plot_code,
    p.status,
    p.area_sqm,
    COALESCE(p.extrusion_height, 4) AS height,
    ST_AsMVTGeom(
      ST_Transform(p.geom, 3857),
      (SELECT env FROM bounds),
      4096, 64, true
    ) AS geom
  FROM plots p, bounds
  WHERE p.organisation_id = $orgId::uuid
    AND p.geom IS NOT NULL
    AND ST_Transform(p.geom, 3857) && (SELECT env FROM bounds)
)
SELECT ST_AsMVT(mvt_geom, 'plots', 4096, 'geom') FROM mvt_geom
WHERE geom IS NOT NULL;
```

### 4.3 Indexing

```sql
CREATE INDEX IF NOT EXISTS plots_geom_idx       ON plots USING GIST (geom);
CREATE INDEX IF NOT EXISTS plots_org_idx        ON plots (organisation_id);
CREATE INDEX IF NOT EXISTS plots_org_geom_idx   ON plots USING GIST (organisation_id, geom);
```

Both lookups (geom intersect + org filter) hit indexes; tile generation stays sub-50ms even on a Supabase shared instance.

### 4.4 Geometry stays out of Prisma

Per the project's hard rule, `plots.geom` is **never** modelled in `schema.prisma`. It's added by `add_postgis_columns.sql`. Tile generation uses `prisma.$queryRaw` with `Prisma.sql` parameterisation. Every Prisma migration is generated with `--create-only` and inspected for accidental `DROP COLUMN geom` before being applied.

---

## 5. 3D scene composition

The map is a **stack of layers**, applied in fixed order. Order matters — terrain must be set before plots, sky last.

```
┌─────────────────────────────────────────────┐
│ Sky / atmosphere                            │  setSky({...})
├─────────────────────────────────────────────┤
│ Labels                  (symbol)            │  text-field: plotCode
│ Plot outlines           (line)              │  white, halo
│ Plot 3D extrusions      (fill-extrusion)    │  height by occupancy/value
│ Plot 2D fills           (fill)              │  toggled with extrusions
│ deck.gl overlay         (TerrainLayer, …)   │  for cinematic effects
│ Drone orthophoto        (raster, per-prop)  │  bounds-clipped
│ ESRI World Imagery      (raster, base)      │
├─────────────────────────────────────────────┤
│ Terrain DEM             (raster-dem source) │  setTerrain({ exaggeration })
└─────────────────────────────────────────────┘
```

### 5.1 Terrain

- Source: MapTiler `terrain-rgb-v2`, encoding `mapbox`.
- Default exaggeration: **1.3** (subtle realism). User slider 0–3.
- 2D mode sets terrain to `null`. 3D mode restores it.
- Pitch in 3D mode: 55°. Camera tween 800ms `easeOut`.

### 5.2 Plot extrusions

- `fill-extrusion-height`: data-driven. Default mapping: `extrusion_height` column → metres. Empty plots get height 2; occupied plots get height 4–12 mapped from a "weight" attribute (rent, area, or building height, decided per tenant).
- `fill-extrusion-base`: 0. (Future: lift plots above terrain at high exaggeration so they don't sink into hills.)
- `fill-extrusion-opacity`: 0.85.
- Status colours: green/blue/red/amber per System Architecture spec §4.3.

### 5.3 Sky

MapLibre v3 `setSky({ sky-color, horizon-color, fog-color, … })`. Subtle haze gives depth without looking gamey.

### 5.4 deck.gl overlay (interleaved mode)

deck.gl runs **inside** MapLibre's GL context (`new MapboxOverlay({ interleaved: true })`). This means terrain occludes deck.gl geometry correctly — no z-fighting. We use it for:

- **TripsLayer** — animated playback of surveyor GPS tracks during inspection.
- **HeatmapLayer** — alert density across a portfolio.
- **PathLayer** — boundary-walk paths (for tenant disputes, evidence trails).
- **IconLayer** — pin clusters for tenants, gates, infrastructure.

Defer deck.gl integration to Phase D unless an early phase needs it.

---

## 6. Drawing & editing toolkit

Use **Terra Draw** rather than `maplibre-gl-draw` — it's actively maintained, MapLibre-first, and supports modes we need (snapping, edit, freehand).

### 6.1 Modes exposed in the toolbar

| Mode          | Behaviour                                                                                      |
| ------------- | ---------------------------------------------------------------------------------------------- |
| **Select**    | Click plot → highlight + open details panel.                                                   |
| **Draw plot** | Click vertices → close polygon. Live area + plot-unit readout in the toolbar.                  |
| **Edit plot** | Drag vertices, add vertices by dragging midpoints, delete with backspace.                      |
| **Split**    | Draw a line that intersects one plot; on commit, splits it into two plots in a single tx.      |
| **Merge**    | Click two adjacent plots that share an edge; commit creates a new plot from the union.         |
| **Measure**   | Distance (great-circle), area (geodesic), bearing.                                             |

### 6.2 Snapping

Snap to vertices and edges of existing plots within a **20-pixel screen radius**, restricted to the active tenant. Implementation: maintain an `RBush` index of plot vertices on the client, rebuilt on each tile refresh; on `pointermove` during draw/edit, query the index and translate the cursor to the snap point.

### 6.3 Live measurements

Display in the toolbar while drawing:

- Area in **m²**
- Area in **standard plot units** (1 plot = 70 ft × 100 ft = 650.32 m²; configurable per tenant in case they use rods/acres)
- Perimeter in metres
- Last segment length (during draw)

### 6.4 Validation (client + server, server wins)

Client (instant feedback):

- No self-intersecting polygons — `turf.kinks`.
- No fewer than 3 vertices.
- Area ≥ 1 m² (sanity).

Server (authoritative, on save):

- No overlap with existing plots in the same property — `ST_Intersects` + `ST_Overlaps`.
- Geometry within property bounds — `ST_Within`.
- Area recomputed server-side (`ST_Area(geom::geography)`) and stored — never trust client area.
- All edits append a row to `plot_audit_log` with `before_geom`, `after_geom`, `actor_id`, `reason`.

### 6.5 Undo / redo

Maintain a draw-session command stack in Redux. Commands are inverse pairs: `addVertex/removeVertex`, `moveVertex(from, to)/moveVertex(to, from)`, `closePolygon/openPolygon`. Cap at 50 entries. Reset on mode change.

---

## 7. Measurement & coordinates

### 7.1 Coordinate readout (bottom bar)

Show the cursor position in three formats simultaneously, switchable:

- **WGS84 decimal**: `5.60322°, -0.18745°` (default)
- **DMS**: `5°36'11.6"N, 0°11'14.8"W`
- **UTM Zone 30N** (Ghana): `E 590234, N 619874` — use `proj4` (`+proj=utm +zone=30 +datum=WGS84`).

### 7.2 Distance & area

`@turf/length` and `@turf/area` give geodesic distances on the WGS84 ellipsoid — correct for Ghana, no projection error. For long distances inside a property (rare here, but possible for boundary walks), Turf is fine; for cross-country distances, switch to `@turf/great-circle`.

### 7.3 Elevation profile

When terrain is enabled, expose a "Profile" tool: user draws a line, the system queries the DEM at sample points along it (using `map.queryTerrainElevation(lngLat)`), and shows an elevation profile in a small chart. Useful for drainage / road planning conversations with clients.

---

## 8. Time-series & comparison (Sentinel-2 history)

The Sentinel-2 cloudless service exposes time-stamped mosaics. We surface this for monitoring:

- **Time slider**: months going back to onboarding. Slider updates the Sentinel-2 tile URL with the target `time=YYYY-MM`.
- **Swipe compare**: split-screen left/right. Left half shows the "before" raster, right half shows "after". MapLibre supports this with two synced maps or with a custom clip-path on a duplicated source.
- **Anomaly highlight** (deferred to Sprint 9 / Satellite Change Detection module): server-side diff produces a heatmap layer with high-change polygons; the map renders it as a translucent red overlay.

---

## 9. Layer manager

A floating panel listing every active layer with:

- Visibility toggle
- Opacity slider
- Reorder by drag
- "Reset" to defaults

Layers exposed by default:

1. Satellite (base)
2. Drone orthophoto (if available for active property)
3. Terrain shading
4. Plot fills / extrusions
5. Plot outlines
6. Plot labels
7. Alert pins
8. Surveyor tracks (deck.gl)
9. Sentinel-2 (time slider)

User layer presets persist server-side (`user_map_preferences.preset_json`) so a manager's preferred view follows them across devices.

---

## 10. Mobile (field surveyor)

The same React component renders on tablet and phone. Adjustments:

- Touch-friendly controls: chips ≥ 44 px, slider thumbs ≥ 24 px.
- **GPS button**: centres on `navigator.geolocation.getCurrentPosition` (high accuracy, 10s timeout); draws an accuracy circle.
- **Live track mode**: `watchPosition` streams positions into a `PathLayer` so surveyors can record a boundary walk; on stop, the path becomes a draft polygon ready for cleanup.
- **Offline tiles** (Phase G, deferred): IndexedDB cache via `idb-keyval`, scoped per property, with a "Download for offline" button that pre-fetches a tile pyramid for a bounding box.

The React Native Android app (Sprint 8) reuses the same vector-tile endpoint via `@maplibre/maplibre-react-native`. Drawing logic lives in a shared `packages/map-core` workspace that both web and RN consume.

---

## 11. Performance budget

Hard targets, measured on a mid-range Android (Tecno Camon, 4GB RAM) over 4G:

| Metric                                        | Target  |
| --------------------------------------------- | ------- |
| First map paint (TTFP)                        | ≤ 1.5 s |
| First plots visible                           | ≤ 2.5 s |
| Pan / zoom frame rate                         | ≥ 50 fps |
| Plot count before frame rate degrades         | 25,000  |
| Tile generation server-side p95               | ≤ 80 ms |
| Memory ceiling                                | ≤ 250 MB |

Tactics:

- Vector tiles, not GeoJSON, past 5k plots.
- `maxBounds` set to the property envelope (plus 20% margin) — prevents the user wandering to Antarctica and pulling tiles forever.
- Debounce style mutations during slider drag (`requestAnimationFrame` throttling).
- `terrain.exaggeration` and `pitch` changes via `easeTo`, never `setTerrain` per frame.
- Web Worker for turf-heavy operations (snapping index rebuild, area computations during draw) — `comlink` for the bridge.

---

## 12. Security

- All tile endpoints (`/api/tiles/plots/...`, `/tiles/ortho/...`) require `requireAuth` → `resolveTenancy`.
- Access tokens (`Authorization: Bearer`) are held **in-memory only** — never localStorage. Refresh tokens live in an httpOnly `refresh_token` cookie scoped to `/api/v1/auth`, sent only on `/auth/refresh` via `withCredentials`. Tile requests authenticate via the same Bearer header as any other API call. See ADR-AUTH-001.
- Drone orthophoto S3 URLs are **always signed** (CloudFront key-pair, 15-minute TTL). Never expose raw S3 keys to the client.
- `Cache-Control: private` on every tenant-specific response so no shared CDN can cross-pollinate.
- `OPTIONS` preflight responses must echo the same `Access-Control-Allow-Origin` as the auth endpoint to avoid CORS-induced fallback to credential-less fetches.
- Tile generation queries are **always parameterised** via `Prisma.sql` — never string concatenation. Same rule everywhere geometry SQL is generated.
- Logs scrub `geom` payloads (Winston redact list).

---

## 13. File tree (target)

```
apps/api/src/
  modules/
    plots/
      plots.routes.ts
      plots.geojson.controller.ts          # legacy, kept for low-volume callers
      plots.tiles.controller.ts            # ST_AsMVT endpoint
      plots.mutations.controller.ts        # draw / split / merge / edit, with audit
      plots.validation.ts                  # zod + turf checks
    orthophotos/
      ortho.routes.ts
      ortho.controller.ts                  # signed-URL minting for titiler
      ortho.signer.ts                      # CloudFront signed URL helper
  middleware/
    requireAuth.ts
    resolveTenancy.ts
  lib/
    prisma.ts

apps/web/src/features/map/
  Map3D.tsx                                # main component
  mapConfig.ts                             # sources, colors, defaults
  mapSlice.ts                              # Redux state
  plotLayers.ts                            # add/sync layer helpers
  terrain.ts                               # terrain + sky setup
  sources/
    satelliteSource.ts
    sentinel2Source.ts
    terrainSource.ts
    orthophotoSource.ts
  drawing/
    DrawToolbar.tsx
    useTerraDraw.ts
    snapping.ts                            # RBush index
    validation.ts                          # client-side turf checks
    undoStack.ts
  measure/
    coordinatesBar.tsx
    measureTool.ts
    elevationProfile.tsx
  time/
    TimeSlider.tsx
    SwipeCompare.tsx
  layers/
    LayerManager.tsx
  mobile/
    GPSButton.tsx
    useGeolocation.ts
  workers/
    snapping.worker.ts                     # comlink-wrapped
  hooks/
    usePlots.ts
    useOrthophoto.ts
    useTilesUrl.ts

packages/map-core/                          # shared with React Native
  src/
    geometry.ts                            # area, perimeter, plot-unit conversion
    validation.ts                          # shared turf rules
    types.ts
```

---

## 14. API contract

| Method | Path                                          | Purpose                                            |
| ------ | --------------------------------------------- | -------------------------------------------------- |
| GET    | `/api/tiles/plots/:z/:x/:y.pbf`               | Org-scoped vector tile of plots                    |
| GET    | `/api/plots/geojson?propertyId=`              | Legacy GeoJSON for ≤5k cases                       |
| POST   | `/api/plots`                                  | Create plot from drawn polygon (server validates)  |
| PATCH  | `/api/plots/:id/geometry`                     | Edit geometry (vertex moves)                       |
| POST   | `/api/plots/:id/split`                        | Split into two; body = splitter LineString         |
| POST   | `/api/plots/merge`                            | Merge ≥2 adjacent plots; body = array of plot IDs  |
| GET    | `/api/orthophotos?propertyId=`                | List orthos for a property                         |
| GET    | `/api/orthophotos/:id/signed-url`             | Mint signed CloudFront URL for titiler tile path   |
| GET    | `/api/map/preferences`                        | Per-user saved layer/view presets                  |
| PUT    | `/api/map/preferences`                        | Update presets                                     |

All routes: `requireAuth` (Authorization: Bearer, in-memory access token) → `resolveTenancy`. `/api/v1/auth/refresh` additionally requires the `x-refresh: 1` header as a CSRF guard for its httpOnly refresh-token cookie — see ADR-AUTH-001.

---

## 15. Build sequence

Each phase is a discrete Claude Code session. Don't begin a phase until the previous phase passes its acceptance criteria. **At the start of every session, re-read this spec.**

### Phase A — Vector tile pipeline (server-side)
**Goal:** `/api/tiles/plots/:z/:x/:y.pbf` returns valid MVT for the caller's org.
- Add `plots.tiles.controller.ts` with the SQL in §4.2.
- Add indexes from §4.3 via a `--create-only` migration; remove any `DROP` lines targeting `geom` before applying.
- Auth + tenancy middleware in the route.
- Set `Cache-Control: private, max-age=60` and `Content-Type: application/x-protobuf`.
- **Accept when:** `curl -i --cookie ...` returns 200 with `Content-Type: application/x-protobuf`, body decodes with `mapbox-vector-tile` to a `plots` layer.

### Phase B — Base 3D map (client)
**Goal:** MapLibre map renders with terrain, satellite, sky, and plots from the MVT endpoint.
- Build `Map3D.tsx`, `mapConfig.ts`, `mapSlice.ts`, `plotLayers.ts`.
- Add `vector` source pointing at `/api/tiles/plots/{z}/{x}/{y}.pbf`.
- Wire 2D/3D toggle, terrain exaggeration slider, status filter chips, label toggle.
- **Accept when:** loading the page shows the property's plots in correct colours, 2D/3D toggle works, terrain exaggeration is interactive.

### Phase C — Drawing toolkit
**Goal:** User can draw, edit, split, merge plots with snapping and live measurements.
- Add Terra Draw with the modes from §6.1.
- Build `snapping.ts` (RBush index, web-worker-backed).
- Build `DrawToolbar.tsx` with live area in m² and plot units.
- Wire server validation (`POST /api/plots`, `PATCH /api/plots/:id/geometry`, `POST /api/plots/:id/split`, `POST /api/plots/merge`).
- Maintain undo/redo stack in Redux.
- **Accept when:** drawing a plot inside an existing property persists; overlapping geometry is rejected by the server with a clear error; snapping pulls cursor to within 1 px of an existing vertex when within 20 px.

### Phase D — deck.gl overlay
**Goal:** Interleaved deck.gl rendering for advanced visualisations.
- Mount `MapboxOverlay` from `@deck.gl/mapbox` with `interleaved: true`.
- Implement `PathLayer` for surveyor tracks and `IconLayer` for alert pins.
- **Accept when:** a path drawn from synthetic track data renders behind plot extrusions where they overlap (correct depth ordering).

### Phase E — Measurement & coordinates
**Goal:** Coordinate readout (decimal/DMS/UTM), distance/area tools, elevation profile.
- Implement `coordinatesBar.tsx` with `proj4` for UTM 30N.
- Implement `measureTool.ts` using turf.
- Implement `elevationProfile.tsx` using `map.queryTerrainElevation`.
- **Accept when:** drawing a 100 m line on flat ground reads as 100 m ± 0.5 m; elevation profile renders for a line over visible terrain.

### Phase F — Time-series and swipe compare
**Goal:** Sentinel-2 time slider + before/after swipe.
- Add `TimeSlider.tsx` controlling the Sentinel-2 source URL.
- Add `SwipeCompare.tsx` rendering two synced maps with a draggable divider.
- **Accept when:** dragging the slider visibly changes imagery between months; swipe divider is draggable with both halves zooming/panning together.

### Phase G — Drone orthophoto loader
**Goal:** When a property has an orthophoto, it loads on top of ESRI inside the property bounds.
- titiler deployed as a sidecar (separate phase doc).
- `useOrthophoto` hook fetches available orthos, mints signed URLs, adds a raster source with the right bounds.
- **Accept when:** for a property with a registered ortho, zooming in reveals centimetre-scale detail within the property polygon and reverts to ESRI outside.

### Phase H — Mobile + GPS + offline pre-cache
**Goal:** Touch-friendly UI, GPS button, live track mode, offline tile cache.
- Add `GPSButton.tsx` and `useGeolocation.ts`.
- Live track mode via `watchPosition` streaming into `PathLayer`.
- Offline pre-cache: IndexedDB tile cache with "Download for offline" per property.
- **Accept when:** on a real phone, GPS-centring works, live track records and renders, and a property pre-cached for offline still renders with the device set to airplane mode.

### Phase I — Performance pass
**Goal:** Hit the §11 targets.
- Profile in Chrome DevTools. Address top three bottlenecks.
- Add the Web Worker for snapping rebuilds.
- Add `maxBounds` per property.
- **Accept when:** the §11 table is met on the reference device.

### Phase J — Layer presets & polish
**Goal:** Saved presets, layer manager UI, final polish.
- `user_map_preferences` table + endpoints.
- `LayerManager.tsx` with reorder + opacity.
- Cinematic `flyTo` on property switch (3 s ease-out, gentle bearing change).
- **Accept when:** a preset saved by user A is restored on next login; layer reordering changes z-order correctly.

---

## 16. Open decisions (for the ADR log)

1. **Plot extrusion height — what does it encode?** Options: occupancy (binary 2 m / 8 m), monthly rent (continuous), area (visual emphasis on large plots), or building height (when buildings exist). Recommendation: rent-driven for the financial-dashboard view, occupancy-driven for the operations view, switchable.
2. **Sentinel-2 provider.** Free tiles from EOX (`s2maps-tiles.eu`) vs. self-hosted via SentinelHub (paid, higher reliability). Default to EOX for v1.
3. **titiler hosting.** Run on the same EC2 as the API (cheap, simple) or its own service (clean separation). Default: same EC2 for v1, split later.
4. **Vector tile cache layer.** Stick with Express + Cache-Control (simple) or insert a Redis tile cache (faster, more code). Default: simple for v1; benchmark before adding Redis.

Each of these gets an ADR entry once chosen.

---

## 17. Out of scope (for v1)

- True 3D building meshes (Cesium / 3D Tiles)
- Photogrammetric drone mesh rendering
- AI land-change detection visual layer (separate module, Sprint 9)
- AR view on mobile
- Multi-floor / underground plot rendering
- WebXR / VR walkthrough

All deferred to v2+ per the business roadmap.

---

## 18. Starter prompt for Claude Code

Paste this at the start of any map-related Claude Code session:

```
You are working on the GeoLand Pro 3D Map subsystem.

Before doing anything else, read these files and treat them as authoritative:

1. docs/architecture/MAP_3D_SPEC.md   ← this spec
2. apps/api/prisma/schema.prisma
3. apps/api/prisma/add_postgis_columns.sql
4. apps/api/src/config/brand.config.ts
5. apps/web/src/features/map/        ← whatever exists today
6. 02_GeoLandPro_DecisionLog_ADR.docx  ← open decisions

Hard rules — do not violate, even if asked:

- No hardcoded brand strings in UI, PDFs, or emails. Always import from brand.config.ts.
- Prisma never manages PostGIS geometry columns. For any new Prisma migration:
  generate with --create-only, open the SQL, delete any DROP statements targeting
  `geom` or any other geometry column, then apply.
- Every database query is scoped to req.organisationId (set by resolveTenancy middleware).
  The only allowed widening is when req.user.isPlatformAdmin === true.
- Access tokens via Authorization: Bearer, in-memory only on the web client.
  Refresh tokens in httpOnly Set-Cookie (`refresh_token`, scoped to `/api/v1/auth`) only — never localStorage. See ADR-AUTH-001.

Your task this session is: [PHASE LETTER and short description, e.g. "Phase A — Vector tile pipeline"].

Acceptance criteria are in MAP_3D_SPEC.md §15 for the phase. Stop and confirm with
me before exceeding the scope of the phase.

When you finish:
- Run the project's lint and typecheck.
- Write a one-paragraph summary of what changed, what's still missing, and any
  decisions you had to make that should go in the ADR.
- Do not commit. I will review.
```

---

## Change log

| Version | Date       | Change                                |
| ------- | ---------- | ------------------------------------- |
| v1.0    | 2026-06-15 | Initial spec; replaces ad-hoc map code |


## ADR-MAP-007 — ST_AsMVTGeom transform vs GIST index

Date: 2026-06-15
Status: Accepted

Context: Phase A initial implementation applied && predicate against
ST_Transform(boundary, 3857), preventing use of idx_plots_boundary (GIST
on raw 4326 boundary). 124ms on the 6126-plot org.

Decision: Compute the tile envelope twice — env_3857 for ST_AsMVTGeom
output, env_4326 for the index-friendly && predicate. Both derive from
the same ST_TileEnvelope call in a single bounds CTE.

Outcome: 124ms → 0.2ms. Index Scan using idx_plots_boundary.

Lesson for future PostGIS work: when an index exists on column X in
projection P, the && predicate must reference column X directly, never
ST_Transform(X, …). Transform the envelope to match the column, not the
column to match the envelope.

## ADR-AUTH-001 — Hybrid auth: Bearer access + cookie refresh

Date: 2026-06-15
Status: Accepted

Context: MAP_3D_SPEC originally specified "no Authorization header,
no localStorage" for all tokens. Investigation showed the real risk
was refresh tokens in localStorage (XSS-stealable, long-lived).
Access tokens are short-lived and in-memory, not a comparable risk.

Decision: Refresh tokens → httpOnly `refresh_token` cookie, scoped to
`/api/v1/auth`, SameSite=Strict. Access tokens stay as Authorization:
Bearer + in-memory on the client. This aligns with the React Native
Sprint 8 plans (Keychain/EncryptedSharedPreferences on mobile) and
avoids an app-wide CSRF rewrite — only `/api/v1/auth/refresh` uses a
cookie, protected by the custom `x-refresh: 1` header (same pattern as
`enforceImpersonationCsrf` in middleware/impersonation.ts).

Outcome: XSS attack on the refresh token is eliminated. Mobile auth
pattern is unchanged. No breaking changes outside the auth endpoints.
The `// TODO SECURITY: migrate to httpOnly cookies` markers in
impersonation.ts and all three AuthContext.tsx files have been removed.