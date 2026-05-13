/**
 * Client-side Simplified ↔ Traditional Chinese conversion via OpenCC.
 *
 * We use the `s2twp` (Simplified → Traditional Taiwan with phrases) and
 * `tw2sp` (reverse) configs because Aniseekr's default Chinese language
 * priority is `繁體中文 🇹🇼`. The "with phrases" variant translates Mainland
 * vocabulary to Taiwan vocabulary (软件→軟體, 视频→影片, 高达→鋼彈) on top
 * of plain character form conversion.
 *
 * Converters are lazy singletons so the ~1 MB dictionary trie is built only
 * when first needed (typically on the first anime detail render after launch).
 *
 * Both conversions are effectively idempotent: re-running `toTraditional` on
 * already-traditional text leaves it unchanged (the trie has no entries for
 * those characters). The non-CJK fast path skips Latin / kana / digit inputs
 * entirely.
 */
import { Converter, type ConverterFunction } from 'opencc-js';

// Covers CJK Unified Ideographs + Extension A + Compatibility Ideographs.
// Extension B (U+20000+) is rare in anime titles and skipped for performance.
const CJK_RE = /[㐀-鿿豈-﫿]/;

let _s2twp: ConverterFunction | null = null;
let _tw2sp: ConverterFunction | null = null;

function s2twp(): ConverterFunction {
  if (_s2twp == null) {
    _s2twp = Converter({ from: 'cn', to: 'twp' });
  }
  return _s2twp;
}

function tw2sp(): ConverterFunction {
  if (_tw2sp == null) {
    _tw2sp = Converter({ from: 'twp', to: 'cn' });
  }
  return _tw2sp;
}

/** True when the input contains at least one CJK ideograph. */
export function containsChinese(input: string): boolean {
  return CJK_RE.test(input);
}

/**
 * Convert Simplified Chinese to Traditional (Taiwan with phrases).
 * Returns the input unchanged for empty / non-CJK strings.
 */
export function toTraditional(input: string): string {
  if (!input || !containsChinese(input)) return input;
  return s2twp()(input);
}

/**
 * Convert Traditional Chinese (Taiwan or generic) to Simplified.
 * Returns the input unchanged for empty / non-CJK strings.
 */
export function toSimplified(input: string): string {
  if (!input || !containsChinese(input)) return input;
  return tw2sp()(input);
}

/**
 * Stable alias for callers that pre-date the `toTraditional` rename. Kept so
 * existing call sites in `UnifiedAnimeItem` don't need to churn.
 */
export const convertSimplifiedToTraditional = toTraditional;

/** Null/undefined-tolerant wrapper around `toTraditional`. */
export function convertOptionalToTraditional(
  input: string | null | undefined
): string | null | undefined {
  if (input === null || input === undefined) return input;
  return toTraditional(input);
}

/** Null/undefined-tolerant wrapper around `toSimplified`. */
export function convertOptionalToSimplified(
  input: string | null | undefined
): string | null | undefined {
  if (input === null || input === undefined) return input;
  return toSimplified(input);
}

/**
 * Return the deduped set of S/T variants for a search query. Non-CJK inputs
 * pass through as a single-element array so callers can iterate uniformly.
 *
 * Order: original first, then the variant(s) that differ from it. The original
 * stays in slot 0 so caches keyed on the user's literal input still hit.
 */
export function expandSearchVariants(query: string): string[] {
  if (!query || !containsChinese(query)) return [query];
  const variants = new Set<string>([query]);
  const trad = toTraditional(query);
  const simp = toSimplified(query);
  if (trad !== query) variants.add(trad);
  if (simp !== query) variants.add(simp);
  return Array.from(variants);
}
