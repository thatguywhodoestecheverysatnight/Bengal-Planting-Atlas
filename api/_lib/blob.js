/* Vercel Blob access for site photos. */
import { put as blobPut } from '@vercel/blob';
import { HttpError } from './http.js';

export function blobConfigured() { return !!(globalThis.__BPA_TEST_BLOB__ || process.env.BLOB_READ_WRITE_TOKEN); }

export async function putPhoto(pathname, body, contentType) {
  if (globalThis.__BPA_TEST_BLOB__) return globalThis.__BPA_TEST_BLOB__(pathname, body, contentType);
  if (!process.env.BLOB_READ_WRITE_TOKEN) throw new HttpError(503, 'Photo storage not connected. Add a Blob store in the Vercel project Storage tab.', { setup: 'BLOB_READ_WRITE_TOKEN' });
  return blobPut(pathname, body, { access: 'public', contentType, addRandomSuffix: true });
}

/* Only accept photo links that point at this project's Blob storage. */
export function isBlobUrl(u) {
  try { const x = new URL(u); return x.protocol === 'https:' && /\.public\.blob\.vercel-storage\.com$/.test(x.hostname); }
  catch (e) { return false; }
}
