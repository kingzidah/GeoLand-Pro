# GeoLand Pro — Architecture Decision Record Deviations

Decisions that deviate from, refine, or extend MAP_3D_SPEC.md.
Each entry is referenced from the spec's Change Log when it affects the spec's hard rules.

---

## ADR-MAP-008 — Plot3DMap data dual-sourcing

Date: 2026-06-15
Status: Accepted

**Context:** Phase B migrated plot polygon RENDERING from a GeoJSON source
(fed by the `plots` prop) to MVT vector tiles
(`GET /api/v1/plots/tiles/{z}/{x}/{y}.pbf?propertyId=<id>`).
However, Plot3DMap still needs the plots array as in-memory metadata for:
- `flyToPlot` centroid lookup (imperative handle)
- `nextPlotNumber` in draw mode
- `alertZonesFeatureCollection` (alert-zones GeoJSON source)
- MiniMap's own independent GeoJSON source

**Decision:** Keep the `plots` prop and its parent-side fetch
(`propertiesApi.listPlotsForMap`) untouched. Polygon GEOMETRY renders from
MVT; polygon METADATA flows through the prop as before. The two sources are
kept in lockstep by TanStack Query invalidation on draw mutations (existing
flow, no change needed).

**Trade-off:** One additional fetch per property load (the list endpoint AND
the tile endpoint both return geometry). Accepted because removing the list
endpoint would require re-architecting four separate metadata consumers, plus
the MiniMap, plus the parent pages' loading states. Cost outweighs the
bandwidth savings — `listPlotsForMap` returns ~12 plots × few KB each.

**Future:** When Phase C (drawing toolkit) adds plot-create UX, decide then
whether to optimistically update the list query cache and invalidate the tile
source, vs. just invalidating both.

---

## ADR-MAP-009 — Brand strings in page files (deferred)

Date: 2026-06-15
Status: Open

**Found:** `DEMO_PROPERTY_NAME = 'Karlsruhe Simulation Estate'` hardcoded in:
- `apps/web/src/pages/map/PropertyMapPage.tsx:23`
- `apps/web/src/pages/properties/EstateSimulatorPage.tsx:14`

Violates the no-hardcoded-brand-strings rule (MAP_3D_SPEC §18 hard rules).

**Decision:** Out of Phase B scope (page files, not the component).
Track for cleanup before next release. Move to `brand.config` or a
per-property `isDemo` flag fetched from the API, so the demo label is
data-driven rather than matched by name string.
