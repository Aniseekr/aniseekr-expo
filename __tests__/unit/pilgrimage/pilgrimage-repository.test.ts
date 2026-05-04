// Deterministic tests for PilgrimageRepository.
// Spec cases: PILG-011 (id-mapping fallback), PILG-012 (idempotent migration).

import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from 'bun:test';
import { LocalDB } from '../../../libs/db';
import { IDMappingService } from '../../../libs/services/sync/id-mapping-service';
import { AnitabiService } from '../../../libs/services/pilgrimage/anitabi-service';
import { PilgrimageRepository } from '../../../libs/services/pilgrimage/pilgrimage-repository';
import type { AnitabiBangumi } from '../../../libs/services/pilgrimage/types';

const SUBJECT_ID = 7157;

const sampleBangumi = (): AnitabiBangumi => ({
  id: SUBJECT_ID,
  cn: '冰菓',
  title: '氷菓',
  city: '岐阜県',
  cover: 'https://image.anitabi.cn/posters/7157.jpg',
  color: '#8DC5D8',
  geo: [35.5, 136.9],
  zoom: 12,
  modified: 1700000000,
  litePoints: [],
  pointsLength: 5,
  imagesLength: 12,
});

describe('PilgrimageRepository', () => {
  let fetchSpy: ReturnType<typeof spyOn>;

  beforeEach(async () => {
    await LocalDB.init();
    await LocalDB.cleanExpiredPilgrimage(Number.MAX_SAFE_INTEGER);
    fetchSpy = spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
    mock.restore();
  });

  it('PILG-011 falls back to IDMappingService when the unified item has no Bangumi id', async () => {
    const mapping = IDMappingService.getInstance();
    const mapSpy = spyOn(mapping, 'mapID').mockResolvedValue(SUBJECT_ID);

    fetchSpy.mockImplementation(
      async () =>
        new Response(JSON.stringify(sampleBangumi()), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
    );

    const service = AnitabiService.resetForTests();
    const repo = new PilgrimageRepository({
      service,
      mappingService: mapping,
    });

    const result = await repo.getSpotsForAnime({
      sourcePlatform: 'anilist',
      id: 12189, // Hyouka's AniList id
      bangumiId: null,
      platformData: { bangumi: null },
    });

    expect(result).not.toBeNull();
    expect(result?.id).toBe(SUBJECT_ID);
    expect(mapSpy).toHaveBeenCalledWith('anilist', 12189, 'bangumi');
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    mapSpy.mockRestore();
  });

  it('PILG-012 calling LocalDB.init twice does not throw and the pilgrimage table remains usable', async () => {
    // First init happened in beforeEach. Calling again must be a no-op.
    await expect(LocalDB.init()).resolves.toBeUndefined();
    await expect(LocalDB.init()).resolves.toBeUndefined();

    // Sanity: write + read still works after multiple inits.
    const cachedAt = 1_700_000_000_000;
    await LocalDB.savePilgrimage({
      bangumiId: SUBJECT_ID,
      title: '氷菓',
      titleCn: '冰菓',
      city: '岐阜県',
      cover: '',
      color: '#8DC5D8',
      centerLat: 35.5,
      centerLng: 136.9,
      zoom: 12,
      pointsLength: 5,
      imagesLength: 12,
      litePointsJson: '[]',
      cachedAt,
      expiresAt: cachedAt + 1_000,
    });

    const row = await LocalDB.getPilgrimage(SUBJECT_ID);
    expect(row).not.toBeNull();
    expect(row?.title).toBe('氷菓');
  });
});
