// Tests for CollectionPilgrimageService — verifies that anime in the user's
// collection (user_anime ∪ favorites) get translated through IDMappingService
// and surfaced as Anitabi entries, with status / favorite flags preserved.

import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from 'bun:test';
import { LocalDB } from '../../../libs/db';
import { IDMappingService } from '../../../libs/services/sync/id-mapping-service';
import { AnitabiService } from '../../../libs/services/pilgrimage/anitabi-service';
import { CollectionPilgrimageService } from '../../../libs/services/pilgrimage/collection-pilgrimage-service';
import type { AnitabiBangumi } from '../../../libs/services/pilgrimage/types';

const sampleBangumi = (overrides: Partial<AnitabiBangumi> = {}): AnitabiBangumi => ({
  id: overrides.id ?? 1,
  cn: overrides.cn ?? '',
  title: overrides.title ?? 'Sample',
  city: overrides.city ?? '',
  cover: overrides.cover ?? '',
  color: overrides.color ?? '#FF9F0A',
  geo: overrides.geo ?? [35.0, 139.0],
  zoom: overrides.zoom ?? 12,
  modified: overrides.modified ?? 0,
  litePoints: overrides.litePoints ?? [],
  pointsLength: overrides.pointsLength ?? 1,
  imagesLength: overrides.imagesLength ?? 1,
});

interface FakeRow {
  anime_id: string;
  status: string | null;
  is_favorite: number;
}

const buildFakeDb = (rows: FakeRow[]): typeof LocalDB => {
  const fake = {
    getAllAsync: async <T>(_sql: string) => rows as unknown as T[],
  };
  return {
    init: async () => undefined,
    getDatabase: async () => fake as never,
  } as unknown as typeof LocalDB;
};

describe('CollectionPilgrimageService', () => {
  let mapping: IDMappingService;
  let anitabi: AnitabiService;

  beforeEach(() => {
    mapping = IDMappingService.getInstance();
    anitabi = AnitabiService.resetForTests();
  });

  afterEach(() => {
    mock.restore();
  });

  it('returns Anitabi entries for collected anime resolved via ID mapping', async () => {
    const db = buildFakeDb([
      { anime_id: '12189', status: 'watching', is_favorite: 0 },
      { anime_id: '99999', status: 'completed', is_favorite: 1 },
    ]);

    const mapSpy = spyOn(mapping, 'mapID').mockImplementation(
      async (_from: string, fromId: number | string) => {
        if (String(fromId) === '12189') return 7157; // Hyouka
        if (String(fromId) === '99999') return null; // unmapped
        return null;
      }
    );
    const fetchSpy = spyOn(anitabi, 'getAnimePilgrimage').mockImplementation(async (id: number) =>
      id === 7157 ? sampleBangumi({ id: 7157, title: '氷菓' }) : null
    );

    const service = new CollectionPilgrimageService({
      db,
      mappingService: mapping,
      anitabi,
      sourcePlatform: 'anilist',
    });

    const entries = await service.getEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0].bangumiId).toBe(7157);
    expect(entries[0].status).toBe('watching');
    expect(entries[0].anime.title).toBe('氷菓');
    expect(mapSpy).toHaveBeenCalledTimes(2);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('treats anime_id as bangumi id directly when source platform is bangumi', async () => {
    const db = buildFakeDb([{ anime_id: '7157', status: 'watching', is_favorite: 0 }]);
    const mapSpy = spyOn(mapping, 'mapID');
    spyOn(anitabi, 'getAnimePilgrimage').mockResolvedValue(
      sampleBangumi({ id: 7157, title: '氷菓' })
    );

    const service = new CollectionPilgrimageService({
      db,
      mappingService: mapping,
      anitabi,
      sourcePlatform: 'bangumi',
    });

    const entries = await service.getEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0].bangumiId).toBe(7157);
    expect(mapSpy).not.toHaveBeenCalled();
  });

  it('merges user_anime + favorites duplicates into a single entry', async () => {
    const db = buildFakeDb([
      { anime_id: '12189', status: 'watching', is_favorite: 0 },
      { anime_id: '12189', status: null, is_favorite: 1 },
    ]);
    spyOn(mapping, 'mapID').mockResolvedValue(7157);
    spyOn(anitabi, 'getAnimePilgrimage').mockResolvedValue(
      sampleBangumi({ id: 7157, title: '氷菓' })
    );

    const service = new CollectionPilgrimageService({
      db,
      mappingService: mapping,
      anitabi,
      sourcePlatform: 'anilist',
    });

    const entries = await service.getEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0].status).toBe('watching');
    expect(entries[0].isFavorite).toBe(true);
  });

  it('drops anime that have no Anitabi entry (404 / null)', async () => {
    const db = buildFakeDb([{ anime_id: '12189', status: 'watching', is_favorite: 0 }]);
    spyOn(mapping, 'mapID').mockResolvedValue(7157);
    spyOn(anitabi, 'getAnimePilgrimage').mockResolvedValue(null);

    const service = new CollectionPilgrimageService({
      db,
      mappingService: mapping,
      anitabi,
      sourcePlatform: 'anilist',
    });

    const entries = await service.getEntries();
    expect(entries).toHaveLength(0);
  });

  it('reports stats with both matched count and total checked', async () => {
    const db = buildFakeDb([
      { anime_id: '1', status: 'watching', is_favorite: 0 },
      { anime_id: '2', status: 'completed', is_favorite: 0 },
      { anime_id: '3', status: null, is_favorite: 1 },
    ]);
    spyOn(mapping, 'mapID').mockImplementation(async (_from: string, fromId: number | string) =>
      String(fromId) === '1' ? 7157 : null
    );
    spyOn(anitabi, 'getAnimePilgrimage').mockResolvedValue(sampleBangumi({ id: 7157 }));

    const service = new CollectionPilgrimageService({
      db,
      mappingService: mapping,
      anitabi,
      sourcePlatform: 'anilist',
    });

    const stats = await service.getStats();
    expect(stats.total).toBe(3);
    expect(stats.matched).toBe(1);
  });

  it('returns empty when collection is empty', async () => {
    const db = buildFakeDb([]);
    const mapSpy = spyOn(mapping, 'mapID');
    const fetchSpy = spyOn(anitabi, 'getAnimePilgrimage');

    const service = new CollectionPilgrimageService({
      db,
      mappingService: mapping,
      anitabi,
      sourcePlatform: 'anilist',
    });

    const entries = await service.getEntries();
    expect(entries).toHaveLength(0);
    expect(mapSpy).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
