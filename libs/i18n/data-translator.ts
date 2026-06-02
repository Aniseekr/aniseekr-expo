// Runtime data translation — distinct from UI catalog.
//
// UI catalog (`useT`) translates fixed app chrome. This file translates values
// that arrived from an API: genres, tags, studios, synopsis text, episode
// titles. The values aren't known at build time, so we can't put them in
// `en.json` — instead we layer:
//
//   1. Source-provided localized fields (caller resolves this BEFORE we run)
//   2. Curated dictionary  ← P1: genres only; P2: tags + studios
//   3. On-device MT        ← P3: Apple Translate (iOS) + ML Kit (Android)
//   4. Original text       ← always available fallback
//
// Every public function returns `{ value, source }` so callers can render a
// machine-translation badge when `source === 'mt'`. Sources earlier in the
// chain are preferred — UI never lies about whether a translation is human-
// curated or machine-generated.

/** Where a translated value came from. UI uses this to badge MT outputs. */
export type TranslationSource =
  | 'native' // already in the target language when we got it
  | 'curated' // hit in our shipped dictionary
  | 'mt' // produced by an on-device machine translator (P3+)
  | 'original'; // unchanged — no translation available

export interface TranslatedValue {
  value: string;
  source: TranslationSource;
}
