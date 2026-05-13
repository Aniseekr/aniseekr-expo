/**
 * Title normalization + fuzzy comparison for cross-platform anime dedup.
 *
 * The hard constraint is: any two strings we declare "the same anime" must
 * actually be the same anime. False positives merge a sequel into a prequel
 * or worse — so we err on the side of returning false. Tier 1 is exact-base
 * + exact-season; Tier 2 only fires for base titles ≥ 6 chars and a
 * Levenshtein distance ≤ 2.
 *
 * Pure functions only — keep them deterministic so unit tests are stable.
 */

interface Normalized {
  base: string;
  seasonNum: number | null;
}

// Roman → Arabic season numerals (Ⅰ–Ⅹ). 1 is treated as "no season suffix" so
// "Title" and "Title Ⅰ" don't get separated.
const ROMAN_TO_ARABIC: Record<string, number> = {
  Ⅰ: 1,
  Ⅱ: 2,
  Ⅲ: 3,
  Ⅳ: 4,
  Ⅴ: 5,
  Ⅵ: 6,
  Ⅶ: 7,
  Ⅷ: 8,
  Ⅸ: 9,
  Ⅹ: 10,
};

// Strip-set: punctuation that varies between platforms (fullwidth vs halfwidth,
// quote styles, brackets, dots, separators). Keeping these in the base would
// make "ハイキュー!!" and "ハイキュー！！" register as different titles.
const PUNCT_RE = /[!?:.,'"()\[\]「」『』【】〜~–—…・·！？：．，'"（）]/g;

const WHITESPACE_RE = /\s+/g;

// Season suffix patterns (post-NFKC). NFKC folds Ⅰ–Ⅹ into ASCII II / III etc.
// So we accept Arabic 2–9 *or* ASCII roman runs (ii–x).
// Anchored to end of string. Capture group 1 is the numeric / roman token.
const SEASON_SUFFIX_RE =
  /\s*(?:season\s*|s|第)?\s*([2-9]|ii|iii|iv|v|vi|vii|viii|ix|x)(?:nd|rd|th)?\s*(?:season|期|季)?$/i;

const ASCII_ROMAN_TO_ARABIC: Record<string, number> = {
  ii: 2,
  iii: 3,
  iv: 4,
  v: 5,
  vi: 6,
  vii: 7,
  viii: 8,
  ix: 9,
  x: 10,
};

export function normalizeTitle(raw: string): Normalized {
  if (!raw) return { base: '', seasonNum: null };

  // Detect & strip pre-NFKC Roman numerals first — NFKC would otherwise fold
  // Ⅱ→"II" and the suffix regex can't distinguish those from word-final "II"
  // in titles like "Trinity II" (we'd still want to treat that as season 2,
  // which is the actual intent, so we then run the post-NFKC regex too).
  let s = raw.normalize('NFKC').toLowerCase();
  s = s.replace(PUNCT_RE, ' ');
  s = s.replace(WHITESPACE_RE, ' ').trim();

  let seasonNum: number | null = null;
  // Direct Roman numeral check (single-glyph forms survive NFKC for very few
  // codepoints, but we keep the table for completeness).
  for (const [glyph, n] of Object.entries(ROMAN_TO_ARABIC)) {
    if (s.endsWith(glyph.toLowerCase())) {
      seasonNum = n;
      s = s.slice(0, -glyph.length).trim();
      break;
    }
  }

  if (seasonNum === null) {
    const m = s.match(SEASON_SUFFIX_RE);
    if (m) {
      const token = m[1].toLowerCase();
      if (/^\d+$/.test(token)) {
        seasonNum = Number(token);
      } else if (ASCII_ROMAN_TO_ARABIC[token]) {
        seasonNum = ASCII_ROMAN_TO_ARABIC[token];
      }
      if (seasonNum !== null) {
        s = s.slice(0, m.index ?? s.length).trim();
      }
    }
  }

  return { base: s, seasonNum };
}

export interface SimilarOpts {
  /** Air year of A. When both years are given we require |yearA - yearB| ≤ 1. */
  year?: number;
  /** Air year of B. */
  yearB?: number;
}

/**
 * Are two raw titles "the same anime"? Two-tier:
 *
 * 1. Exact match on (base, seasonNum) — the strict case.
 * 2. Fuzzy: both bases ≥ 6 chars, Levenshtein ≤ 2, and seasonNum matches.
 *
 * Year guardrail: if both opts.year and opts.yearB are given, |diff| > 1
 * forces false even when titles match. Stops reboots/remakes from collapsing
 * into the original.
 */
export function similarTitles(a: string, b: string, opts: SimilarOpts = {}): boolean {
  const na = normalizeTitle(a);
  const nb = normalizeTitle(b);

  if (!na.base || !nb.base) return false;

  if (typeof opts.year === 'number' && typeof opts.yearB === 'number') {
    if (Math.abs(opts.year - opts.yearB) > 1) return false;
  }

  if (na.seasonNum !== nb.seasonNum) return false;

  if (na.base === nb.base) return true;

  if (na.base.length >= 6 && nb.base.length >= 6) {
    if (levenshtein(na.base, nb.base) <= 2) return true;
  }

  return false;
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  // Two-row rolling DP — O(min(a,b)) memory.
  const m = a.length;
  const n = b.length;
  let prev = new Array<number>(n + 1);
  let curr = new Array<number>(n + 1);

  for (let j = 0; j <= n; j++) prev[j] = j;

  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
      curr[j] = Math.min(
        curr[j - 1] + 1, // insertion
        prev[j] + 1, // deletion
        prev[j - 1] + cost // substitution
      );
    }
    [prev, curr] = [curr, prev];
  }
  return prev[n];
}
