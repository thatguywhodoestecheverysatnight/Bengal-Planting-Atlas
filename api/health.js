/* GET /api/health : which parts of the backend are connected. */
import { json } from './_lib/http.js';
import { dbConfigured, ensureSchema } from './_lib/db.js';
import { blobConfigured } from './_lib/blob.js';
import { adminConfigured } from './_lib/auth.js';

export async function GET() {
  const out = {
    ok: true,
    database: dbConfigured(), photos: blobConfigured(), archivePasscode: adminConfigured(),
    placeNames: process.env.GOOGLE_MAPS_API_KEY ? 'google' : 'openstreetmap',
    databaseReachable: false
  };
  if (out.database) {
    try { await ensureSchema(); out.databaseReachable = true; } catch (e) { out.databaseError = String(e.message || e).slice(0, 200); }
  }
  const missing = [];
  if (!out.database) missing.push('Connect a Neon Postgres database (Storage tab) so DATABASE_URL is set');
  if (!out.photos) missing.push('Connect a Blob store (Storage tab) so BLOB_READ_WRITE_TOKEN is set');
  if (!out.archivePasscode) missing.push('Add an ADMIN_TOKEN environment variable to unlock the archive');
  out.setupRemaining = missing;
  return json(out);
}
