/**
 * Live integration smoke against api.jikan.moe/v4.
 * Spec case: MAL-010 (live top anime returns at least 5 items).
 *
 * Gated by `process.env.SKIP_INTEGRATION === '1'`. Per-test budget: 30s.
 */

import { describe, expect, it } from 'bun:test';
import { JikanDataSource } from '../../libs/services/data-sources/jikan-data-source';

const SKIP = process.env.SKIP_INTEGRATION === '1';
const suite = SKIP ? describe.skip : describe;

suite('Jikan live API', () => {
  it('MAL-010 live fetchTopAnime returns at least 5 items', async () => {
    const ds = new JikanDataSource();
    const items = await ds.fetchTopAnime(1);
    expect(Array.isArray(items)).toBe(true);
    expect(items.length).toBeGreaterThanOrEqual(5);

    const first = items[0];
    // Every item must carry a MAL id and a title.
    expect(first.idMal).toBeDefined();
    expect(typeof first.title).toBe('string');
    expect(first.title.length).toBeGreaterThan(0);
    expect(first.platformData.myanimelist?.id).toBeDefined();
  }, 30_000);
});
