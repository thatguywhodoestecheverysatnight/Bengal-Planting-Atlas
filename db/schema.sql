-- Bengal Planting Atlas : archive schema (Neon / any Postgres 13+)
-- The API creates this automatically on first use; run it by hand only if you prefer.
CREATE TABLE IF NOT EXISTS planting_runs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  session_id      text,                 -- anonymous per-browser id, groups one visitor's runs
  input_hash      text NOT NULL,        -- hash of every input, used to skip exact duplicates
  trigger         text,                 -- map, district, preset, field, button
  lat             double precision NOT NULL,
  lon             double precision NOT NULL,
  place_name      text,                 -- reverse-geocoded name shown under the coordinates
  place           jsonb,                -- full geocoder result (locality, block, district, source)
  district        text,
  zone            text,                 -- agro-climatic zone
  inputs          jsonb NOT NULL,       -- area, shape, land cover, micro-topography, tidal, air criterion
  site            jsonb NOT NULL,       -- extracted environmental profile
  weights         jsonb NOT NULL,       -- criteria, severities, AHP weights, lambda max, CI, CR
  palette         jsonb NOT NULL,       -- prescribed tree, understory tree, shrub, ground cover
  ranked          jsonb NOT NULL,       -- every species that cleared SSI 0.85, by stratum
  layout          jsonb NOT NULL,       -- layout metrics, species counts, ground-cover zoning
  planting_window jsonb NOT NULL,       -- onset, window start, target, end
  air_carbon      jsonb,                -- PM10, NCAP flag, APTI summary, CO2 figures
  photos          jsonb NOT NULL DEFAULT '[]'::jsonb,  -- [{url, kind: site|surroundings, name, width, height, bytes}]
  engine_version  text NOT NULL,        -- the layout is deterministic, so inputs + version reproduce it exactly
  user_agent      text
);
CREATE INDEX IF NOT EXISTS planting_runs_created_idx  ON planting_runs (created_at DESC);
CREATE INDEX IF NOT EXISTS planting_runs_district_idx ON planting_runs (district);
CREATE INDEX IF NOT EXISTS planting_runs_session_idx  ON planting_runs (session_id, input_hash, created_at DESC);
