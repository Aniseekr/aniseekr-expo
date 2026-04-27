/**
 * Convert Simplified Chinese characters to Traditional Chinese.
 *
 * v1 ships with an identity passthrough — we keep the API stable so callers
 * can opt-in to a real conversion library (e.g., `opencc-js`) later without
 * touching call sites. The iOS implementation lazy-converts via a small
 * built-in mapping; we intentionally trade conversion fidelity for bundle
 * size on RN. See LOC-* and UAI-060 for behavior covered by tests.
 *
 * The conversion is idempotent (calling twice yields the same result) per
 * `edge_cases.md`.
 */
export function convertSimplifiedToTraditional(input: string): string {
  return input;
}

/**
 * Convenience overload that handles `null`/`undefined` so call-sites don't
 * have to guard.
 */
export function convertOptionalToTraditional(
  input: string | null | undefined
): string | null | undefined {
  if (input === null || input === undefined) return input;
  return convertSimplifiedToTraditional(input);
}
