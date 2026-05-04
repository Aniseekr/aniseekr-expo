/**
 * Anime season helpers. Mirrors the Swift season detection used by AniList
 * and Jikan data sources.
 *
 * Conventions:
 * - Months are 1-indexed (1..12) to match `Date.getMonth() + 1` ergonomics.
 * - Season strings are upper-case to match AniList's `MediaSeason` enum.
 */
export type Season = 'WINTER' | 'SPRING' | 'SUMMER' | 'FALL';

export function getSeasonForMonth(month: number): Season {
  // 12, 1, 2 → WINTER
  // 3, 4, 5 → SPRING
  // 6, 7, 8 → SUMMER
  // 9, 10, 11 → FALL
  const m = ((((Math.floor(month) - 1) % 12) + 12) % 12) + 1;
  if (m === 12 || m <= 2) return 'WINTER';
  if (m <= 5) return 'SPRING';
  if (m <= 8) return 'SUMMER';
  return 'FALL';
}

export function getCurrentYear(now: Date = new Date()): number {
  return now.getFullYear();
}

export function getCurrentSeason(now: Date = new Date()): Season {
  return getSeasonForMonth(now.getMonth() + 1);
}
