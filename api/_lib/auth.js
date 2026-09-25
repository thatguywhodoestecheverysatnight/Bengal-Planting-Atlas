/* Passcode check for the private archive. The passcode is the ADMIN_TOKEN
   environment variable, sent by the archive page as the x-admin-token header. */
import { createHash, timingSafeEqual } from 'node:crypto';
import { HttpError } from './http.js';

const digest = s => createHash('sha256').update(String(s)).digest();

export function adminConfigured() { return !!process.env.ADMIN_TOKEN; }

export function requireAdmin(request) {
  const expected = process.env.ADMIN_TOKEN;
  if (!expected) throw new HttpError(503, 'The archive is locked until ADMIN_TOKEN is set in the Vercel project settings.', { setup: 'ADMIN_TOKEN' });
  const auth = request.headers.get('authorization') || '';
  const given = request.headers.get('x-admin-token') || (auth.startsWith('Bearer ') ? auth.slice(7) : '');
  if (!given || !timingSafeEqual(digest(given), digest(expected))) throw new HttpError(401, 'Wrong passcode.');
}
