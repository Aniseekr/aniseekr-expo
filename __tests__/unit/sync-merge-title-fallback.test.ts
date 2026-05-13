import { describe, it, expect } from 'bun:test';
import { MultiPlatformSyncService } from '../../libs/services/sync/multi-platform-sync-service';
import { normalizeTitle, similarTitles } from '../../libs/services/sync/title-normalize';
import type { UniversalAnimeItem, PlatformType } from '../../libs/services/auth/types';

function makeItem(overrides: Partial<UniversalAnimeItem> & { source: PlatformType }): UniversalAnimeItem {
  return {
    id: `${overrides.source}:${overrides.platformIds?.[overrides.source] ?? '0'}`,
    title: overrides.title ?? '',
    imageUrl: '',
    status: 'watching',
    progress: 0,
    updatedAt: new Date('2025-01-01T00:00:00Z'),
    platformIds: overrides.platformIds ?? { [overrides.source]: '0' },
    ...overrides,
  } as UniversalAnimeItem;
}

const svc = MultiPlatformSyncService.getInstance();

describe('areSameAnime — title fallback', () => {
  it('1. positive fallback: matching native title, disjoint IDs → method=title', () => {
    const a = makeItem({
      source: 'anilist',
      title: 'Frieren: Beyond Journey\'s End',
      titleJapanese: '葬送のフリーレン',
      platformIds: { anilist: '154587' },
    });
    const b = makeItem({
      source: 'bangumi',
      title: '葬送的芙莉蓮',
      titleJapanese: '葬送のフリーレン',
      platformIds: { bangumi: '400602' },
    });
    expect(svc.areSameAnime(a, b)).toEqual({ same: true, method: 'title' });
  });

  it('2. sequel separation: 進撃の巨人 vs 進撃の巨人 Season 2 → same=false', () => {
    const a = makeItem({
      source: 'anilist',
      title: 'Attack on Titan',
      titleJapanese: '進撃の巨人',
      platformIds: { anilist: '16498' },
    });
    const b = makeItem({
      source: 'bangumi',
      title: 'Attack on Titan Season 2',
      titleJapanese: '進撃の巨人 Season 2',
      platformIds: { bangumi: '129496' },
    });
    expect(svc.areSameAnime(a, b).same).toBe(false);
  });

  it('3. short title no over-fuzzy: K vs X → same=false', () => {
    const a = makeItem({
      source: 'anilist',
      title: 'K',
      titleJapanese: 'K',
      platformIds: { anilist: '11577' },
    });
    const b = makeItem({
      source: 'anilist',
      title: 'X',
      titleJapanese: 'X',
      platformIds: { anilist: '37' },
    });
    expect(svc.areSameAnime(a, b).same).toBe(false);
  });

  it('4. NFKC boundary: ハイキュー!! vs ハイキュー！！ → same=true, method=title', () => {
    const a = makeItem({
      source: 'anilist',
      title: 'Haikyu!!',
      titleJapanese: 'ハイキュー!!',
      platformIds: { anilist: '20464' },
    });
    const b = makeItem({
      source: 'bangumi',
      title: '排球少年!!',
      titleJapanese: 'ハイキュー!!'.replace(/!/g, '！'),
      platformIds: { bangumi: '81873' },
    });
    expect(svc.areSameAnime(a, b)).toEqual({ same: true, method: 'title' });
  });

  it('5. year mismatch: same base/season but 5 year gap → same=false', () => {
    const a = makeItem({
      source: 'anilist',
      title: 'Hunter x Hunter',
      titleJapanese: 'HUNTER×HUNTER',
      startDate: new Date('1999-10-16T00:00:00Z'),
      platformIds: { anilist: '136' },
    });
    const b = makeItem({
      source: 'anilist',
      title: 'Hunter x Hunter (2011)',
      titleJapanese: 'HUNTER×HUNTER',
      startDate: new Date('2011-10-02T00:00:00Z'),
      platformIds: { anilist: '11061' },
    });
    expect(svc.areSameAnime(a, b).same).toBe(false);
  });
});

describe('normalizeTitle — primitives', () => {
  it('NFKC folds fullwidth punctuation', () => {
    const a = normalizeTitle('ハイキュー!!');
    const b = normalizeTitle('ハイキュー！！'); // ！！
    expect(a.base).toBe(b.base);
    expect(a.seasonNum).toBe(b.seasonNum);
  });

  it('extracts season from "Season 2"', () => {
    const r = normalizeTitle('Attack on Titan Season 2');
    expect(r.seasonNum).toBe(2);
    expect(r.base).toBe('attack on titan');
  });

  it('extracts season from 第2期', () => {
    const r = normalizeTitle('進撃の巨人 第2期');
    expect(r.seasonNum).toBe(2);
  });

  it('roman numeral Ⅱ → 2', () => {
    const r = normalizeTitle('Ghost in the Shell Ⅱ');
    expect(r.seasonNum).toBe(2);
  });
});

describe('similarTitles — guardrails', () => {
  it('rejects length < 6 with non-identical bases', () => {
    expect(similarTitles('Kai', 'Tai')).toBe(false);
  });

  it('accepts levenshtein ≤ 2 when base ≥ 6', () => {
    expect(similarTitles('Sword Art Online', 'Sword Art Onlin')).toBe(true);
  });

  it('year diff > 1 forces false even when titles identical', () => {
    expect(similarTitles('Same Title Here', 'Same Title Here', { year: 1999, yearB: 2011 })).toBe(
      false
    );
  });

  it('year diff ≤ 1 allowed', () => {
    expect(similarTitles('Same Title Here', 'Same Title Here', { year: 2020, yearB: 2021 })).toBe(
      true
    );
  });
});

describe('mergeItems — smoke test (title fallback path)', () => {
  it('merges at least one pair via title when IDs do not overlap', async () => {
    // Five minimal fixtures: two pairs that should merge by title (AniList ↔ Bangumi)
    // and one singleton. None of the AniList IDs equal any of the Bangumi IDs,
    // so without title fallback nothing would merge.
    const items: UniversalAnimeItem[] = [
      makeItem({
        source: 'anilist',
        title: 'Frieren: Beyond Journey\'s End',
        titleJapanese: '葬送のフリーレン',
        platformIds: { anilist: '154587' },
      }),
      makeItem({
        source: 'bangumi',
        title: '葬送的芙莉蓮',
        titleJapanese: '葬送のフリーレン',
        platformIds: { bangumi: '400602' },
      }),
      makeItem({
        source: 'anilist',
        title: 'Bocchi the Rock!',
        titleJapanese: 'ぼっち・ざ・ろっく!',
        platformIds: { anilist: '130003' },
      }),
      makeItem({
        source: 'bangumi',
        title: '孤獨搖滾!',
        titleJapanese: 'ぼっち・ざ・ろっく！',
        platformIds: { bangumi: '364450' },
      }),
      makeItem({
        source: 'anilist',
        title: 'Solo Leveling',
        titleJapanese: '俺だけレベルアップな件',
        platformIds: { anilist: '127230' },
      }),
    ];

    const result = await svc.mergeItems(items);
    expect(result.mergedByTitleCount).toBeGreaterThanOrEqual(1);
    // Singletons: Solo Leveling has no partner.
    expect(result.singletonCount).toBeGreaterThanOrEqual(1);
  });
});
