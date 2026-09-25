/* Neon Postgres access. The table is created on first use, so a fresh
   database needs no manual migration. db/schema.sql holds the same DDL. */
import { neon } from '@neondatabase/serverless';
import { HttpError } from './http.js';

let client = null, ready = null;

export function dbConfigured() {
  return !!(globalThis.__BPA_TEST_SQL__ || process.env.DATABASE_URL || process.env.POSTGRES_URL);
}

export function sql() {
  if (globalThis.__BPA_TEST_SQL__) return globalThis.__BPA_TEST_SQL__;
  if (!client) {
    const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
    if (!url) throw new HttpError(503, 'Database not connected. Add a Neon Postgres database in the Vercel project Storage tab.', { setup: 'DATABASE_URL' });
    client = neon(url);
  }
  return client;
}

export const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS planting_runs (
     id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
     created_at      timestamptz NOT NULL DEFAULT now(),
     session_id      text,
     input_hash      text NOT NULL,
     trigger         text,
     lat             double precision NOT NULL,
     lon             double precision NOT NULL,
     place_name      text,
     place           jsonb,
     district        text,
     zone            text,
     inputs          jsonb NOT NULL,
     site            jsonb NOT NULL,
     weights         jsonb NOT NULL,
     palette         jsonb NOT NULL,
     ranked          jsonb NOT NULL,
     layout          jsonb NOT NULL,
     planting_window jsonb NOT NULL,
     air_carbon      jsonb,
     photos          jsonb NOT NULL DEFAULT '[]'::jsonb,
     engine_version  text NOT NULL,
     user_agent      text
   )`,
  `CREATE INDEX IF NOT EXISTS planting_runs_created_idx  ON planting_runs (created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS planting_runs_district_idx ON planting_runs (district)`,
  `CREATE INDEX IF NOT EXISTS planting_runs_session_idx  ON planting_runs (session_id, input_hash, created_at DESC)`
];

export function ensureSchema() {
  if (!ready) {
    ready = (async () => { const q = sql(); for (const s of SCHEMA) await q.query(s); })()
      .catch(e => { ready = null; throw e; });
  }
  return ready;
}
