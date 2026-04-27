import type { UnifiedAnimeItem } from '../models/unified-anime-item';

/**
 * Resolve the best display title for the user's preferred language.
 *
 * Fallback chain:
 *   zh-Hans / zh-CN / zh                → titleChinese
 *   zh-Hant / zh-TW / zh-HK             → titleChineseTraditional → titleChinese
 *   ja / ja-JP                          → titleJapanese
 *   ru / ru-RU                          → titleRussian
 *   en / en-US / en-GB                  → titleEnglish
 *   *                                   → titleEnglish → titleRomaji → title
 *
 * The function NEVER returns an empty string. As a last resort it returns
 * `item.title`, which is guaranteed by the constructor to be non-null.
 */
export function getDisplayTitle(item: UnifiedAnimeItem, lang: string): string {
  const normalized = (lang || '').toLowerCase().replace('_', '-');

  const candidates: (string | null)[] = [];

  if (normalized.startsWith('zh-hans') || normalized === 'zh-cn' || normalized === 'zh') {
    candidates.push(item.titleChinese);
    candidates.push(item.titleChineseTraditional);
  } else if (
    normalized.startsWith('zh-hant') ||
    normalized === 'zh-tw' ||
    normalized === 'zh-hk'
  ) {
    candidates.push(item.titleChineseTraditional);
    candidates.push(item.titleChinese);
  } else if (normalized.startsWith('ja')) {
    candidates.push(item.titleJapanese);
  } else if (normalized.startsWith('ru')) {
    candidates.push(item.titleRussian);
  } else if (normalized.startsWith('en')) {
    candidates.push(item.titleEnglish);
  }

  // Universal fallback chain after language-specific.
  candidates.push(item.titleEnglish, item.titleRomaji, item.title);

  for (const candidate of candidates) {
    if (candidate && candidate.length > 0) return candidate;
  }
  return item.title;
}
