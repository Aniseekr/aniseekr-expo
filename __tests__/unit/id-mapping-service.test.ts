import { describe, it, expect, beforeEach, spyOn } from 'bun:test';
import { IDMappingService } from '../../libs/services/sync/id-mapping-service';
import { LocalDB } from '../../libs/db';

describe('IDMappingService', () => {
  beforeEach(() => {
    IDMappingService.__resetForTests();
  });

  it('IDM-001 MAL to AniList path returns mapped ID for known mapping', async () => {
    const svc = IDMappingService.getInstance();
    // Seed a manual override that simulates the downloaded mapping table.
    svc.setManualMapping('myanimelist', 1, 'anilist', 1);
    const mapped = await svc.mapID('myanimelist', 1, 'anilist');
    expect(mapped).toBe('1');
  });

  it('IDM-002 unknown id returns null', async () => {
    const svc = IDMappingService.getInstance();
    const mapped = await svc.mapID('myanimelist', 999_999_999, 'anilist');
    expect(mapped).toBeNull();
  });

  it('IDM-003 same platform passthrough returns the original id', async () => {
    const svc = IDMappingService.getInstance();
    const mapped = await svc.mapID('anilist', 12345, 'anilist');
    expect(mapped).toBe(12345);
    // Also via the typed `translate` alias.
    const mapped2 = await svc.translate(12345, 'anilist', 'anilist');
    expect(mapped2).toBe(12345);
  });

  it('IDM-004 manual mapping persists and is retrievable', async () => {
    const svc = IDMappingService.getInstance();
    svc.setManualMapping('bangumi', 7157, 'myanimelist', 12189);
    expect(svc.getManualMapping('bangumi', 7157, 'myanimelist')).toBe('12189');
    const mapped = await svc.mapID('bangumi', 7157, 'myanimelist');
    expect(mapped).toBe('12189');
  });

  it('IDM-005 Bangumi to MAL path returns mapped ID when mapping exists', async () => {
    const svc = IDMappingService.getInstance();
    svc.setManualMapping('bangumi', 7157, 'myanimelist', 12189);
    const mapped = await svc.mapID('bangumi', 7157, 'myanimelist');
    expect(mapped).toBe('12189');
  });

  it('IDM-006 bulk insert wraps in a single transaction', async () => {
    const svc = IDMappingService.getInstance();
    const db = await LocalDB.getDatabase();
    const txSpy = spyOn(db, 'withTransactionAsync');
    await svc.bulkInsert([
      { mal_id: 1, anilist_id: 11 },
      { mal_id: 2, anilist_id: 22 },
      { mal_id: 3, anilist_id: 33 },
    ]);
    expect(txSpy).toHaveBeenCalledTimes(1);
    txSpy.mockRestore();
  });
});
