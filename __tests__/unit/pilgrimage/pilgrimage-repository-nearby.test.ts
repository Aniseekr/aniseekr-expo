// Deterministic tests for PilgrimageRepository.getNearbyAnime.
// Spec cases: PILG-NEAR-001 (sort), PILG-NEAR-002 (filter nulls).

import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { LocalDB } from '../../../libs/db';
import { AnitabiService } from '../../../libs/services/pilgrimage/anitabi-service';
import { LocationService } from '../../../libs/services/pilgrimage/location-service';
import { PilgrimageRepository } from '../../../libs/services/pilgrimage/pilgrimage-repository';
import type { AnitabiBangumi } from '../../../libs/services/pilgrimage/types';

interface FakePermission {
  status: 'granted' | 'denied' | 'undetermined';
  canAskAgain: boolean;
}

interface FakeLocationModule {
  Accuracy: { Balanced: number };
  requestForegroundPermissionsAsync: ReturnType<typeof mock>;
  getForegroundPermissionsAsync: ReturnType<typeof mock>;
  getCurrentPositionAsync: ReturnType<typeof mock>;
  watchPositionAsync: ReturnType<typeof mock>;
}

const buildFakeLocationModule = (): FakeLocationModule => ({
  Accuracy: { Balanced: 3 },
  requestForegroundPermissionsAsync: mock(
    async (): Promise<FakePermission> => ({ status: 'granted', canAskAgain: true })
  ),
  getForegroundPermissionsAsync: mock(
    async (): Promise<FakePermission> => ({ status: 'granted', canAskAgain: true })
  ),
  getCurrentPositionAsync: mock(async (_opts: unknown) => ({
    coords: { latitude: 35.6895, longitude: 139.6917 },
  })),
  watchPositionAsync: mock(async (_opts: unknown, _cb: unknown) => ({
    remove: () => undefined,
  })),
});

let fakeLocationModule: FakeLocationModule;
mock.module('expo-location', () => {
  if (!fakeLocationModule) fakeLocationModule = buildFakeLocationModule();
  return fakeLocationModule;
});

const sampleBangumi = (overrides: Partial<AnitabiBangumi> = {}): AnitabiBangumi => ({
  id: overrides.id ?? 1,
  cn: '',
  title: 'Sample',
  city: '',
  cover: '',
  color: '',
  geo: [35.0, 135.0],
  zoom: 10,
  modified: 0,
  litePoints: [],
  pointsLength: 0,
  imagesLength: 0,
  ...overrides,
});

class StubAnitabiService {
  // The repository expects a getAnimePilgrimage implementation only.
  byId = new Map<number, AnitabiBangumi | null>();
  failures = new Set<number>();

  setEntry(id: number, value: AnitabiBangumi | null) {
    this.byId.set(id, value);
  }
  setFailure(id: number) {
    this.failures.add(id);
  }
  async getAnimePilgrimage(id: number): Promise<AnitabiBangumi | null> {
    if (this.failures.has(id)) throw new Error('boom');
    return this.byId.has(id) ? this.byId.get(id) ?? null : null;
  }
  async getDetailedPoints(): Promise<never[]> {
    return [];
  }
}

const TOKYO = { latitude: 35.6895, longitude: 139.6917 };

describe('PilgrimageRepository.getNearbyAnime', () => {
  beforeEach(async () => {
    await LocalDB.init();
    fakeLocationModule = buildFakeLocationModule();
  });

  afterEach(() => {
    mock.restore();
  });

  it('PILG-NEAR-001 returns results sorted by ascending distance', async () => {
    const stub = new StubAnitabiService();
    // Tokyo (0km), Kyoto (~364km), Fukuoka (~880km).
    stub.setEntry(1, sampleBangumi({ id: 1, title: 'Tokyo', geo: [35.6895, 139.6917] }));
    stub.setEntry(2, sampleBangumi({ id: 2, title: 'Kyoto', geo: [35.0116, 135.7681] }));
    stub.setEntry(3, sampleBangumi({ id: 3, title: 'Fukuoka', geo: [33.5904, 130.4017] }));

    const repo = new PilgrimageRepository({
      service: stub as unknown as AnitabiService,
      locationService: LocationService.resetForTests({
        module: fakeLocationModule as unknown as typeof import('expo-location'),
      }),
    });

    const results = await repo.getNearbyAnime(TOKYO, [3, 1, 2]);
    expect(results.map((r) => r.anime.title)).toEqual(['Tokyo', 'Kyoto', 'Fukuoka']);
    expect(results[0]?.distanceKm).toBeLessThan(0.1);
    expect(results[1]?.distanceKm).toBeGreaterThan(350);
    expect(results[1]?.distanceKm).toBeLessThan(380);
    expect(results[2]?.distanceKm).toBeGreaterThan(800);
  });

  it('PILG-NEAR-002 filters out null fetches and entries with empty geo', async () => {
    const stub = new StubAnitabiService();
    stub.setEntry(1, sampleBangumi({ id: 1, title: 'Real', geo: [35.0116, 135.7681] }));
    stub.setEntry(2, null);
    stub.setEntry(3, sampleBangumi({ id: 3, title: 'NoGeo', geo: [0, 0] }));
    stub.setFailure(4); // simulates network error -> caught -> null

    const repo = new PilgrimageRepository({
      service: stub as unknown as AnitabiService,
      locationService: LocationService.resetForTests({
        module: fakeLocationModule as unknown as typeof import('expo-location'),
      }),
    });

    const results = await repo.getNearbyAnime(TOKYO, [1, 2, 3, 4]);
    expect(results).toHaveLength(1);
    expect(results[0]?.anime.title).toBe('Real');
  });

  it('PILG-NEAR-003 honours the limit option', async () => {
    const stub = new StubAnitabiService();
    stub.setEntry(1, sampleBangumi({ id: 1, title: 'A', geo: [35.69, 139.69] }));
    stub.setEntry(2, sampleBangumi({ id: 2, title: 'B', geo: [35.01, 135.77] }));
    stub.setEntry(3, sampleBangumi({ id: 3, title: 'C', geo: [33.59, 130.40] }));

    const repo = new PilgrimageRepository({
      service: stub as unknown as AnitabiService,
      locationService: LocationService.resetForTests({
        module: fakeLocationModule as unknown as typeof import('expo-location'),
      }),
    });

    const results = await repo.getNearbyAnime(TOKYO, [1, 2, 3], { limit: 2 });
    expect(results).toHaveLength(2);
    expect(results.map((r) => r.anime.title)).toEqual(['A', 'B']);
  });

  it('PILG-NEAR-004 returns [] when no candidates supplied', async () => {
    const stub = new StubAnitabiService();
    const repo = new PilgrimageRepository({
      service: stub as unknown as AnitabiService,
      locationService: LocationService.resetForTests({
        module: fakeLocationModule as unknown as typeof import('expo-location'),
      }),
    });
    const results = await repo.getNearbyAnime(TOKYO, []);
    expect(results).toEqual([]);
  });
});
