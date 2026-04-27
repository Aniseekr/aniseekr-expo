import { describe, it, expect } from 'bun:test';
import { UnifiedAnimeItem } from '../../libs/models/unified-anime-item';
import { getDisplayTitle } from '../../libs/utils/anime-localization-service';

function makeItem(overrides: Partial<ConstructorParameters<typeof UnifiedAnimeItem>[0]> = {}) {
  return new UnifiedAnimeItem({ title: 'CanonicalTitle', ...overrides });
}

describe('AnimeLocalizationService', () => {
  it('LOC-001 display title falls through chain and never returns empty', () => {
    const itemMinimal = makeItem();
    expect(getDisplayTitle(itemMinimal, 'fr-FR')).toBe('CanonicalTitle');
    // Empty lang string also resolves to canonical title.
    expect(getDisplayTitle(itemMinimal, '')).toBe('CanonicalTitle');
  });

  it('LOC-002 zh-Hans returns titleChinese when present', () => {
    const item = makeItem({ titleChinese: '冰菓', titleEnglish: 'Hyouka' });
    expect(getDisplayTitle(item, 'zh-Hans')).toBe('冰菓');
    expect(getDisplayTitle(item, 'zh-CN')).toBe('冰菓');
    // zh-Hant prefers traditional, then falls back to simplified.
    expect(getDisplayTitle(item, 'zh-Hant')).toBe('冰菓');
  });

  it('LOC-003 falls back to canonical title when no localized title available', () => {
    const item = makeItem({ titleEnglish: null });
    // Japanese requested but only canonical is set.
    expect(getDisplayTitle(item, 'ja-JP')).toBe('CanonicalTitle');
    // Russian requested but only canonical is set.
    expect(getDisplayTitle(item, 'ru-RU')).toBe('CanonicalTitle');
  });

  it('LOC-004 search keywords include synonyms', () => {
    const item = makeItem({
      title: 'Cowboy Bebop',
      titleEnglish: 'COWBOY',
      synonyms: ['CB', 'Bebop'],
    });
    expect(item.searchKeywords).toContain('cb');
    expect(item.searchKeywords).toContain('bebop');
    expect(item.searchKeywords).toContain('cowboy');
  });
});
