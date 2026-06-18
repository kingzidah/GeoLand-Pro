-- Run this AFTER prisma migrate dev
-- Adds PostGIS geometry columns and spatial indexes not managed by Prisma

-- Enable the PostGIS extension (idempotent)
CREATE EXTENSION IF NOT EXISTS postgis;

-- plots.boundary — used for spatial intersection queries and area calculation
ALTER TABLE plots
  ADD COLUMN IF NOT EXISTS boundary geometry(Polygon, 4326);

CREATE INDEX IF NOT EXISTS idx_plots_boundary
  ON plots USING GIST (boundary);

-- properties.boundary — used to visualise full estate outline
ALTER TABLE properties
  ADD COLUMN IF NOT EXISTS boundary geometry(MultiPolygon, 4326);

CREATE INDEX IF NOT EXISTS idx_properties_boundary
  ON properties USING GIST (boundary);

-- geofence_alerts.boundary — used for ST_Contains / ST_Intersects checks
ALTER TABLE geofence_alerts
  ADD COLUMN IF NOT EXISTS boundary geometry(Polygon, 4326);

CREATE INDEX IF NOT EXISTS idx_geofence_alerts_boundary
  ON geofence_alerts USING GIST (boundary);

-- Handy function: sync GeoJSON → PostGIS geometry when a plot boundary is saved
CREATE OR REPLACE FUNCTION sync_plot_boundary()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW."boundaryGeoJSON" IS NOT NULL THEN
    NEW.boundary = ST_SetSRID(
      ST_GeomFromGeoJSON(NEW."boundaryGeoJSON"::text),
      4326
    );
    -- Recalculate area in square metres using geography cast
    NEW."areaSqm" = ST_Area(NEW.boundary::geography);
    -- Compute centroid
    NEW."centroidLat" = ST_Y(ST_Centroid(NEW.boundary));
    NEW."centroidLng" = ST_X(ST_Centroid(NEW.boundary));
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_plot_boundary ON plots;
CREATE TRIGGER trg_sync_plot_boundary
  BEFORE INSERT OR UPDATE OF "boundaryGeoJSON"
  ON plots
  FOR EACH ROW EXECUTE FUNCTION sync_plot_boundary();
