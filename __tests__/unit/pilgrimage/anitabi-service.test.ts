// Deterministic unit tests for AnitabiService.
// Spec cases: PILG-001, PILG-002, PILG-003, PILG-004.

import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from 'bun:test';
import { LocalDB } from '../../../libs/db';
import { CacheService } from '../../../libs/services/cache-service';
import {
  AnitabiService,
  PILGRIMAGE_TTL_MS,
} from '../../../libs/services/pilgrimage/anitabi-service';
import type {
  AnitabiBangumi,
  RawAnitabiBangumiPoints,
} from '../../../libs/services/pilgrimage/types';

const SUBJECT_ID = 7157;

const sampleBangumi = (): AnitabiBangumi => ({
  id: SUBJECT_ID,
  cn: '冰菓',
  title: '氷菓',
  city: '岐阜県',
  cover: 'https://image.anitabi.cn/posters/7157.jpg?plan=h160',
  color: '#8DC5D8',
  geo: [35.5, 136.9],
  zoom: 12,
  modified: 1700000000,
  litePoints: [
    {
      id: 'p1',
      name: 'Kamiyama High School',
      cn: '神山高中',
      image: 'https://image.anitabi.cn/scenes/7157/p1.jpg',
      ep: 1,
      s: 90,
      geo: [35.51, 136.91],
    },
  ],
  pointsLength: 5,
  imagesLength: 12,
});

function fakeResponse(status: number, body: unknown): Response {
  const init = {
    status,
    headers: { 'Content-Type': 'application/json' },
  } as ResponseInit;
  return new Response(status === 204 ? null : JSON.stringify(body), init);
}

// Raw GET /bangumi/{id}/points payload — an object wrapping the point list,
// not a bare array. AnitabiService normalises it before caching.
const samplePointsResponse = (): RawAnitabiBangumiPoints => ({
  points: [
    {
      id: 'p1',
      name: 'Kamiyama High School',
      cn: '神山高中',
      image: 'https://image.anitabi.cn/scenes/7157/p1.jpg',
      ep: 1,
      s: 90,
      geo: [35.51, 136.91],
    },
  ],
});

describe('AnitabiService', () => {
  let fetchSpy: ReturnType<typeof spyOn>;

  beforeEach(async () => {
    await LocalDB.init();
    // Reset SQLite by clearing through cleanExpiredPilgrimage with very high cutoff.
    await LocalDB.cleanExpiredPilgrimage(Number.MAX_SAFE_INTEGER);
    await CacheService.clear();
    fetchSpy = spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
    mock.restore();
  });

  it('PILG-001 maps HTTP 404 from getAnimePilgrimage to null', async () => {
    fetchSpy.mockResolvedValue(fakeResponse(404, { error: 'not found' }));
    const svc = AnitabiService.resetForTests();

    const result = await svc.getAnimePilgrimage(SUBJECT_ID);

    expect(result).toBeNull();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const url = String((fetchSpy.mock.calls[0] as unknown[])[0]);
    expect(url).toBe(`https://api.anitabi.cn/bangumi/${SUBJECT_ID}/lite`);
  });

  it('PILG-002 caches the result in memory so a second call does not call fetch', async () => {
    fetchSpy.mockImplementation(async () => fakeResponse(200, sampleBangumi()));
    const svc = AnitabiService.resetForTests();

    const first = await svc.getAnimePilgrimage(SUBJECT_ID);
    const second = await svc.getAnimePilgrimage(SUBJECT_ID);

    expect(first?.title).toBe('氷菓');
    expect(second).toBe(first);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('PILG-002b dedupes concurrent lite calls — single network request', async () => {
    let fetchCount = 0;
    fetchSpy.mockImplementation(async () => {
      fetchCount += 1;
      await new Promise((r) => setTimeout(r, 5));
      return fakeResponse(200, sampleBangumi());
    });
    const svc = AnitabiService.resetForTests();

    const [first, second] = await Promise.all([
      svc.getAnimePilgrimage(SUBJECT_ID),
      svc.getAnimePilgrimage(SUBJECT_ID),
    ]);

    expect(first).toBe(second);
    expect(fetchCount).toBe(1);
  });

  it('PILG-003 persists the lite payload into the SQLite pilgrimage_spots table', async () => {
    fetchSpy.mockResolvedValue(fakeResponse(200, sampleBangumi()));
    const svc = AnitabiService.resetForTests();

    await svc.getAnimePilgrimage(SUBJECT_ID);

    const row = await LocalDB.getPilgrimage(SUBJECT_ID);
    expect(row).not.toBeNull();
    expect(row?.title).toBe('氷菓');
    expect(row?.title_cn).toBe('冰菓');
    expect(row?.city).toBe('岐阜県');
    expect(row?.points_length).toBe(5);
    expect(row?.lite_points_json).toContain('Kamiyama High School');
    expect(row?.expires_at).toBeGreaterThan(row?.cached_at ?? 0);
  });

  it('PILG-005 getDetailedPoints caches in memory — second call does not refetch', async () => {
    fetchSpy.mockImplementation(async () => fakeResponse(200, samplePointsResponse()));
    const svc = AnitabiService.resetForTests();

    const first = await svc.getDetailedPoints(SUBJECT_ID);
    const second = await svc.getDetailedPoints(SUBJECT_ID);

    expect(first.length).toBe(1);
    expect(second).toBe(first);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const url = String((fetchSpy.mock.calls[0] as unknown[])[0]);
    expect(url).toBe(`https://api.anitabi.cn/bangumi/${SUBJECT_ID}/points`);
  });

  it('PILG-006 getDetailedPoints persists to SQLite — survives a fresh instance', async () => {
    fetchSpy.mockImplementation(async () => fakeResponse(200, samplePointsResponse()));
    const svc1 = AnitabiService.resetForTests();
    await svc1.getDetailedPoints(SUBJECT_ID);
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    // New instance forgets in-memory cache; SQLite still has the row.
    const svc2 = AnitabiService.resetForTests();
    const points = await svc2.getDetailedPoints(SUBJECT_ID);
    expect(points.length).toBe(1);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('PILG-007 getDetailedPoints dedupes concurrent calls — single network request', async () => {
    let fetchCount = 0;
    fetchSpy.mockImplementation(async () => {
      fetchCount += 1;
      // Tiny delay so the second call has time to land while we're "in flight".
      await new Promise((r) => setTimeout(r, 5));
      return fakeResponse(200, samplePointsResponse());
    });
    const svc = AnitabiService.resetForTests();

    const [resA, resB] = await Promise.all([
      svc.getDetailedPoints(SUBJECT_ID),
      svc.getDetailedPoints(SUBJECT_ID),
    ]);

    expect(resA).toBe(resB);
    expect(fetchCount).toBe(1);
  });

  it('PILG-008 getDetailedPoints returns [] on 404 and remembers the miss', async () => {
    fetchSpy.mockResolvedValue(fakeResponse(404, { error: 'not found' }));
    const svc = AnitabiService.resetForTests();

    const first = await svc.getDetailedPoints(SUBJECT_ID);
    const second = await svc.getDetailedPoints(SUBJECT_ID);

    expect(first).toEqual([]);
    expect(second).toEqual([]);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('PILG-004 refetches once the SQLite row has passed its 7-day TTL', async () => {
    const t0 = 1_700_000_000_000;
    // Each call must return a fresh Response — bodies are single-use streams.
    fetchSpy.mockImplementation(async () => fakeResponse(200, sampleBangumi()));

    // First call at t0 — populates SQLite + memory cache.
    let now = t0;
    const svc = AnitabiService.resetForTests({ now: () => now });
    const first = await svc.getAnimePilgrimage(SUBJECT_ID);
    expect(first?.id).toBe(SUBJECT_ID);
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    // Drop the in-memory cache so SQLite is consulted again.
    svc.invalidate(SUBJECT_ID);

    // Just before TTL boundary — SQLite hit, no extra fetch.
    now = t0 + PILGRIMAGE_TTL_MS - 1;
    const cachedHit = await svc.getAnimePilgrimage(SUBJECT_ID);
    expect(cachedHit?.id).toBe(SUBJECT_ID);
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    // After TTL — cache invalid; service should refetch.
    svc.invalidate(SUBJECT_ID);
    now = t0 + PILGRIMAGE_TTL_MS + 1_000;
    const refreshed = await svc.getAnimePilgrimage(SUBJECT_ID);
    expect(refreshed?.id).toBe(SUBJECT_ID);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });
});
