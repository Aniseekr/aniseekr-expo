import { describe, it, expect } from 'bun:test';
import { UnifiedAnimeItem } from '../../libs/models/unified-anime-item';

describe('UnifiedAnimeItem — construction & identity', () => {
  it('UAI-001 constructs minimal item with UUID id when no platformData', () => {
    const item = new UnifiedAnimeItem({ title: 'Cowboy Bebop' });
    expect(item.title).toBe('Cowboy Bebop');
    expect(item.sourcePlatform).toBeNull();
    // Loose UUID v4 shape: 8-4-4-4-12 hex
    expect(item.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });

  it('UAI-002 bangumi platformData wins over MAL and AniList for id', () => {
    const item = new UnifiedAnimeItem({
      title: 'Hyouka',
      platformData: {
        bangumi: { id: '7157' },
        myanimelist: { id: '12189' },
        anilist: { id: '12189' },
      },
    });
    expect(item.id).toBe('7157');
    expect(item.sourcePlatform).toBe('bangumi');
  });

  it('UAI-003 mal platformData is second priority when no bangumi', () => {
    const item = new UnifiedAnimeItem({
      title: 'Hyouka',
      platformData: {
        myanimelist: { id: '12189' },
        anilist: { id: '12189' },
      },
    });
    expect(item.id).toBe('12189');
    expect(item.sourcePlatform).toBe('myanimelist');
  });

  it('UAI-004 anilist platformData is third priority when no bangumi/mal', () => {
    const item = new UnifiedAnimeItem({
      title: 'Hyouka',
      platformData: {
        anilist: { id: '12189' },
      },
    });
    expect(item.sourcePlatform).toBe('anilist');
    expect(item.id).toBe('12189');
  });

  it('UAI-005 empty platform id falls back to UUID', () => {
    const item = new UnifiedAnimeItem({
      title: 'Cowboy Bebop',
      platformData: { bangumi: { id: '' } },
    });
    expect(item.sourcePlatform).toBeNull();
    expect(item.id).toMatch(/^[0-9a-f]{8}-/);
  });
});

describe('UnifiedAnimeItem — search keywords', () => {
  it('UAI-010 buildSearchKeywords returns lowercased concatenation of titles + synonyms', () => {
    const result = UnifiedAnimeItem.buildSearchKeywords({
      titleDefault: 'Cowboy Bebop',
      titleEn: 'COWBOY',
      titleJp: 'カウボーイビバップ',
      titleCn: '星际牛仔',
      synonyms: ['CB', 'Bebop'],
    });
    expect(result).toBe('cowboy bebop cowboy カウボーイビバップ 星际牛仔 cb bebop');
  });

  it('UAI-011 buildSearchKeywords filters null titles before joining', () => {
    const result = UnifiedAnimeItem.buildSearchKeywords({
      titleDefault: 'Cowboy Bebop',
      titleEn: null,
      titleJp: null,
      titleCn: null,
      synonyms: ['CB'],
    });
    expect(result).toBe('cowboy bebop cb');
  });

  it('UAI-012 custom searchKeywords arg overrides auto-build', () => {
    const item = new UnifiedAnimeItem({
      title: 'Cowboy Bebop',
      titleEnglish: 'COWBOY',
      synonyms: ['CB', 'Bebop'],
      searchKeywords: 'custom override',
    });
    expect(item.searchKeywords).toBe('custom override');
  });
});

describe('UnifiedAnimeItem — normalizedScore', () => {
  it('UAI-020 normalizedScore divides anilist score over 10 by 10', () => {
    const item = new UnifiedAnimeItem({ title: 'A', anilistScore: 85 });
    expect(item.normalizedScore).toBe(8.5);
  });

  it('UAI-021 normalizedScore preserves anilist score under 10 (no double divide)', () => {
    const item = new UnifiedAnimeItem({ title: 'A', anilistScore: 8.5 });
    expect(item.normalizedScore).toBe(8.5);
    // Boundary: exactly 10 should NOT be divided (uses strict > check).
    const tenItem = new UnifiedAnimeItem({ title: 'B', anilistScore: 10 });
    expect(tenItem.normalizedScore).toBe(10);
  });

  it('UAI-022 normalizedScore returns mal score when no anilist', () => {
    const item = new UnifiedAnimeItem({ title: 'A', malScore: 7.5 });
    expect(item.normalizedScore).toBe(7.5);
  });

  it('UAI-023 normalizedScore returns bangumi score when no anilist or mal', () => {
    const item = new UnifiedAnimeItem({ title: 'A', bangumiScore: 8.2 });
    expect(item.normalizedScore).toBe(8.2);
  });

  it('UAI-024 normalizedScore returns null when no scores set', () => {
    const item = new UnifiedAnimeItem({ title: 'A' });
    expect(item.normalizedScore).toBeNull();
  });
});

describe('UnifiedAnimeItem — bestImage', () => {
  it('UAI-030 bestImage prefers AniList over Bangumi', () => {
    const item = new UnifiedAnimeItem({
      title: 'A',
      platformImages: {
        anilist: { large: 'https://anilist.example/a.jpg' },
        bangumi: { large: 'https://bgm.example/a.jpg' },
      },
    });
    expect(item.bestImage('large')).toBe('https://anilist.example/a.jpg');
  });

  it('UAI-031 bestImage prefers Bangumi when AniList absent', () => {
    const item = new UnifiedAnimeItem({
      title: 'A',
      platformImages: {
        bangumi: { large: 'https://bgm.example/a.jpg' },
        myanimelist: { large: 'https://mal.example/a.jpg' },
      },
    });
    expect(item.bestImage('large')).toBe('https://bgm.example/a.jpg');
  });

  it('UAI-032 bestImage falls back to coverImageURL when no platformImages set', () => {
    const item = new UnifiedAnimeItem({
      title: 'A',
      coverImageURL: 'https://fallback.example/a.jpg',
    });
    expect(item.bestImage('large')).toBe('https://fallback.example/a.jpg');
  });

  it('UAI-033 bestImage extraLarge uses extraLarge field, not large', () => {
    const item = new UnifiedAnimeItem({
      title: 'A',
      platformImages: {
        anilist: { large: 'large-only.jpg' },
      },
      extraLargeImageURL: 'fallback-extra.jpg',
    });
    // No platform has extraLarge → fall back to top-level extraLargeImageURL.
    expect(item.bestImage('extraLarge')).toBe('fallback-extra.jpg');

    // When AniList does have extraLarge, that wins.
    const item2 = new UnifiedAnimeItem({
      title: 'A',
      platformImages: {
        anilist: { extraLarge: 'anilist-extra.jpg', large: 'anilist-large.jpg' },
      },
    });
    expect(item2.bestImage('extraLarge')).toBe('anilist-extra.jpg');
  });

  it('UAI-034 bestImage banner uses bannerImageURL field, not large', () => {
    const item = new UnifiedAnimeItem({
      title: 'A',
      platformImages: {
        anilist: { large: 'large-only.jpg' },
      },
      bannerImageURL: 'fallback-banner.jpg',
    });
    expect(item.bestImage('banner')).toBe('fallback-banner.jpg');
  });
});

describe('UnifiedAnimeItem — equality', () => {
  it('UAI-040 two items with same id are equal regardless of other fields', () => {
    const a = new UnifiedAnimeItem({
      title: 'A',
      platformData: { bangumi: { id: '7157' } },
    });
    const b = new UnifiedAnimeItem({
      title: 'Different Title',
      synopsis: 'Different synopsis',
      platformData: { bangumi: { id: '7157' } },
    });
    expect(a.equals(b)).toBe(true);
    expect(a.id).toBe(b.id);
  });

  it('UAI-041 hashCode is stable across equal items', () => {
    const a = new UnifiedAnimeItem({
      title: 'A',
      platformData: { bangumi: { id: '7157' } },
    });
    const b = new UnifiedAnimeItem({
      title: 'B',
      platformData: { bangumi: { id: '7157' } },
    });
    expect(a.hashCode).toBe(b.hashCode);
  });
});

describe('UnifiedAnimeItem — merge', () => {
  function makeBangumi(): UnifiedAnimeItem {
    return new UnifiedAnimeItem({
      title: 'BangumiTitle',
      titleChinese: '冰菓',
      coverImageURL: 'bgm-cover.jpg',
      bangumiScore: 8.2,
      maxProgress: 12,
      status: 'completed',
      genres: ['Mystery'],
      tags: ['Slice of Life'],
      platformData: { bangumi: { id: '7157' } },
    });
  }
  function makeAnilist(): UnifiedAnimeItem {
    return new UnifiedAnimeItem({
      title: 'AniListTitle',
      titleEnglish: 'Hyouka',
      coverImageURL: 'anilist-cover.jpg',
      anilistScore: 85,
      maxProgress: 5,
      status: 'watching',
      genres: ['Mystery', 'Romance'],
      tags: ['School', 'Mystery'],
      platformData: { anilist: { id: '12189' } },
    });
  }

  it('UAI-050 merge picks bangumi title over anilist', () => {
    const merged = UnifiedAnimeItem.merge([makeAnilist(), makeBangumi()]);
    expect(merged?.title).toBe('BangumiTitle');
  });

  it('UAI-051 merge picks anilist cover even when bangumi present', () => {
    const merged = UnifiedAnimeItem.merge([makeBangumi(), makeAnilist()]);
    expect(merged?.coverImageURL).toBe('anilist-cover.jpg');
  });

  it('UAI-052 merge picks max progress across input items', () => {
    const merged = UnifiedAnimeItem.merge([makeAnilist(), makeBangumi()]);
    expect(merged?.maxProgress).toBe(12);
  });

  it('UAI-053 merge picks watching over completed when both present', () => {
    const merged = UnifiedAnimeItem.merge([makeBangumi(), makeAnilist()]);
    expect(merged?.status).toBe('watching');
  });

  it('UAI-054 merge returns unique sorted genres from all sources', () => {
    const merged = UnifiedAnimeItem.merge([makeAnilist(), makeBangumi()]);
    expect(merged?.genres).toEqual(['Mystery', 'Romance']);
  });

  it('UAI-055 merge of empty array returns null (does not throw)', () => {
    expect(UnifiedAnimeItem.merge([])).toBeNull();
  });
});

describe('UnifiedAnimeItem — adult content detection', () => {
  it('UAI-070 flags iOS SFW blacklist genres and tags case-insensitively', () => {
    expect(new UnifiedAnimeItem({ title: 'A', genres: ['Ecchi'] }).isAdult).toBe(true);
    expect(new UnifiedAnimeItem({ title: 'B', genres: ['harem'] }).isAdult).toBe(true);
    expect(new UnifiedAnimeItem({ title: 'C', tags: ['Sexual Violence'] }).isAdult).toBe(true);
    expect(new UnifiedAnimeItem({ title: 'D', tags: ['nudity'] }).isAdult).toBe(true);
    expect(new UnifiedAnimeItem({ title: 'E', genres: ['Space'], tags: ['School'] }).isAdult).toBe(
      false
    );
  });

  it('UAI-071 preserves an explicit adult flag when merging platform items', () => {
    const explicitAdult = new UnifiedAnimeItem({
      title: 'Adult source flag',
      isAdult: true,
      platformData: { anilist: { id: '1' } },
    });
    const safeMetadata = new UnifiedAnimeItem({
      title: 'Safe-looking metadata',
      genres: ['Drama'],
      tags: ['School'],
      platformData: { bangumi: { id: '2' } },
    });

    const merged = UnifiedAnimeItem.merge([explicitAdult, safeMetadata]);

    expect(merged?.isAdult).toBe(true);
  });
});

describe('UnifiedAnimeItem — localization & synonym preservation', () => {
  it('UAI-060 traditional title autocomputed from titleChinese when not provided', () => {
    const item = new UnifiedAnimeItem({ title: 'A', titleChinese: '冰菓' });
    // v1 conversion is identity passthrough but field MUST be populated and
    // must equal titleChinese (idempotency requirement of edge_cases.md).
    expect(item.titleChineseTraditional).toBe('冰菓');

    // Explicit override wins.
    const item2 = new UnifiedAnimeItem({
      title: 'A',
      titleChinese: '冰菓',
      titleChineseTraditional: '冰菓 (manual)',
    });
    expect(item2.titleChineseTraditional).toBe('冰菓 (manual)');
  });

  it('UAI-061 synonyms array stored as-is (preserves empty strings)', () => {
    const synonyms = ['Hyouka', '', 'Ice Cream'];
    const item = new UnifiedAnimeItem({ title: 'A', synonyms });
    expect(item.synonyms).toEqual(['Hyouka', '', 'Ice Cream']);
    // Defensive copy — mutating the input does NOT affect the item.
    synonyms.push('Mutation');
    expect(item.synonyms).toEqual(['Hyouka', '', 'Ice Cream']);
  });
});
