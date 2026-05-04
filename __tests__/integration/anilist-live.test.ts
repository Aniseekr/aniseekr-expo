/**
 * Live integration smoke against graphql.anilist.co.
 * Spec cases: ANIL-009 (live search), ANIL-010 (live detail Cowboy Bebop id 1).
 *
 * Gated by `process.env.SKIP_INTEGRATION === '1'` (see SPEC.md §6 — env-gated
 * skip is allowed; permanent `.skip` is not). Allowed budget per test: 30s.
 */

import { describe, expect, it } from 'bun:test';
import { AniListDataSource } from '../../libs/services/data-sources/anilist-data-source';

const SKIP = process.env.SKIP_INTEGRATION === '1';
const suite = SKIP ? describe.skip : describe;

suite('AniList live API', () => {
  it('ANIL-009 live search for "Naruto" returns a non-empty array', async () => {
    const ds = new AniListDataSource();
    const results = await ds.searchAnime('Naruto', 1);
    expect(Array.isArray(results)).toBe(true);
    expect(results.length).toBeGreaterThan(0);

    // First result should reference Naruto in some title slot.
    const first = results[0];
    const haystack =
      `${first.title} ${first.titleEnglish ?? ''} ${first.titleRomaji ?? ''}`.toLowerCase();
    expect(haystack).toContain('naruto');
  }, 30_000);

  it('ANIL-010 live fetchAnimeDetail with id 1 returns Cowboy Bebop', async () => {
    const ds = new AniListDataSource();
    const item = await ds.fetchAnimeDetail('1', 'anilist');
    // AniList media id 1 is Cowboy Bebop. Title varies by language slot;
    // assert via romaji which is consistently populated.
    expect(item.titleRomaji?.toLowerCase()).toContain('cowboy bebop');
    expect(item.idMal).toBe(1);
    expect(item.platformData.anilist?.id).toBe('1');
  }, 30_000);
});
