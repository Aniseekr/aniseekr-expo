// Fallback cover URLs for genres whose per-genre AniList fetch returned no
// image. Populated lazily as the user enters a genre and we discover a real
// cover from the deck's first page; merged into `getGenres()` so the carousel
// stops rendering the empty placeholder on subsequent visits.
//
// TTL is 24h — long enough that we don't re-write on every visit, short enough
// that a once-broken cover URL eventually rotates back to live AniList data
// the next time a genre fetch succeeds.

import { LocalDB } from '../../db';

const TTL_MS = 24 * 60 * 60 * 1000;

export async function getOverrides(): Promise<Record<string, string>> {
  try {
    const rows = await LocalDB.getGenreCoverOverrides();
    const byId: Record<string, string> = {};
    const now = Date.now();
    for (const row of rows) {
      if (now - row.updated_at > TTL_MS) continue;
      byId[row.id] = row.url;
    }
    return byId;
  } catch (err) {
    console.warn('[genre-cover-override] getOverrides failed', err);
    return {};
  }
}

export async function setOverride(id: string, url: string): Promise<void> {
  if (!id || !url) return;
  try {
    await LocalDB.setGenreCoverOverride(id, url);
  } catch (err) {
    console.warn('[genre-cover-override] setOverride failed', err);
  }
}
