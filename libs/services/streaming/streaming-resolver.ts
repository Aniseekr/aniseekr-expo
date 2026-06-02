/**
 * Resolve an anime's "where to watch" rows from three inputs:
 *   1. AniList externalLinks (already fetched into `AnimeStreaming[]`)
 *   2. The streaming-platform catalog (matches sites/URLs to catalog ids)
 *   3. The user's streaming prefs (which platforms they prefer and primary)
 *
 * Output is a deterministic, sorted list of `WatchOption` rows the UI can
 * render directly. No fake / synthesized rows: if there is no real URL to
 * build (e.g. blank title, unknown site with no URL) the entry is dropped.
 */

import type { AnimeStreaming } from '../data-sources/anime-data-source';
import type { StreamingPrefs } from '../user-prefs';
import {
  buildDeepLink,
  buildSearchUrl,
  getStreamingPlatform,
  matchStreamingPlatformByUrl,
  matchStreamingPlatformBySite,
  resolveLogoDomain,
  type StreamingPlatformId,
  type StreamingPlatformSpec,
} from './streaming-platforms';

export type WatchOptionSource = 'official' | 'search';

export interface WatchOption {
  /** Catalog id, or null when the source is an "unknown" AniList site. */
  platformId: StreamingPlatformId | null;
  /** Display label shown in chips and CTA copy. */
  displayName: string;
  /** Brand color (hex) — same convention as the catalog. */
  color: string;
  /** Ionicons glyph used as a generic icon. */
  icon: string;
  /** Resolvable URL the linker will open. Always present (never empty). */
  url: string;
  /** Optional deep-link scheme the linker can probe before falling back to `url`. */
  deepLink?: string;
  /**
   * 'official' — link confirmed by AniList; 'search' — fallback search URL we
   * built from the user's enabled platforms. The UI shows the badge for the
   * difference so users know the difference between "available here" and
   * "search here".
   */
  source: WatchOptionSource;
  /** True when this option is the user's chosen primary platform. */
  isPrimary: boolean;
  /** True when this option is in the user's enabled list. */
  isEnabled: boolean;
  /** Domain to feed the clearbit logo CDN. Null for unknown / unindexed sites. */
  logoDomain: string | null;
  /** Optional pinned icon URL (e.g. Play Store app icon) — tried before favicon/clearbit. */
  iconUrl?: string;
  /** 1–2 char monogram rendered when the real logo can't load. */
  monogram: string;
}

interface ResolveInput {
  animeTitle: string | null | undefined;
  anilistStreaming: AnimeStreaming[];
  prefs: StreamingPrefs;
}

const UNKNOWN_FALLBACK_COLOR = '#3B82F6';
const UNKNOWN_FALLBACK_ICON = 'play-circle';

export function resolveWatchOptions(input: ResolveInput): WatchOption[] {
  const { animeTitle, anilistStreaming, prefs } = input;
  const enabledSet = new Set<StreamingPlatformId>(prefs.enabled);
  const usedKeys = new Set<string>();
  const officialByPlatform = new Map<StreamingPlatformId, WatchOption>();
  const officialUnknowns: WatchOption[] = [];

  for (const entry of anilistStreaming) {
    if (!entry || !entry.url) continue;
    const spec = matchStreamingPlatformByUrl(entry.url) ?? matchStreamingPlatformBySite(entry.site);

    if (spec) {
      // Dedup: first URL wins for a given platform.
      if (officialByPlatform.has(spec.id)) continue;
      const key = `official:${spec.id}`;
      if (usedKeys.has(key)) continue;
      usedKeys.add(key);
      officialByPlatform.set(spec.id, buildOption(spec, entry.url, 'official', prefs, enabledSet));
    } else {
      // Unknown site → carry the raw label so we can still show the user
      // *something* tappable, without lying about which platform it is.
      const key = `unknown:${(entry.site ?? '').toLowerCase()}:${entry.url}`;
      if (usedKeys.has(key)) continue;
      usedKeys.add(key);
      officialUnknowns.push({
        platformId: null,
        displayName: entry.site || 'Watch',
        color: UNKNOWN_FALLBACK_COLOR,
        icon: UNKNOWN_FALLBACK_ICON,
        url: entry.url,
        source: 'official',
        isPrimary: false,
        isEnabled: false,
        logoDomain: extractHostFromUrl(entry.url),
        monogram: monogramFromLabel(entry.site || 'Watch'),
      });
    }
  }

  // Build search-URL fallbacks for enabled platforms with no official match.
  const searchOptions: WatchOption[] = [];
  const trimmedTitle = (animeTitle ?? '').trim();
  for (const id of prefs.enabled) {
    if (officialByPlatform.has(id)) continue;
    const spec = getStreamingPlatform(id);
    if (!spec) continue;
    const searchUrl = trimmedTitle ? buildSearchUrl(id, trimmedTitle) : null;
    if (!searchUrl) continue;
    searchOptions.push(buildOption(spec, searchUrl, 'search', prefs, enabledSet));
  }

  // Order: primary first; then user-enabled order (mix of official + search);
  // then unenabled AniList officials; then unknown-site AniList officials.
  const primary = prefs.primary;
  const searchByPlatform = new Map(searchOptions.map((o) => [o.platformId, o]));
  const enabledOrdered: WatchOption[] = [];
  if (primary) {
    const fromOfficial = officialByPlatform.get(primary);
    const fromSearch = searchByPlatform.get(primary);
    const opt = fromOfficial ?? fromSearch;
    if (opt) enabledOrdered.push(opt);
  }
  for (const id of prefs.enabled) {
    if (id === primary) continue;
    const fromOfficial = officialByPlatform.get(id);
    const fromSearch = searchByPlatform.get(id);
    const opt = fromOfficial ?? fromSearch;
    if (opt) enabledOrdered.push(opt);
  }

  const unenabledOfficials: WatchOption[] = [];
  for (const [id, opt] of officialByPlatform) {
    if (enabledSet.has(id)) continue;
    unenabledOfficials.push(opt);
  }

  return [...enabledOrdered, ...unenabledOfficials, ...officialUnknowns];
}

function buildOption(
  spec: StreamingPlatformSpec,
  url: string,
  source: WatchOptionSource,
  prefs: StreamingPrefs,
  enabledSet: Set<StreamingPlatformId>
): WatchOption {
  const deepLink = prefs.preferAppDeepLink ? (buildDeepLink(spec.id, url) ?? undefined) : undefined;
  return {
    platformId: spec.id,
    displayName: spec.displayName,
    color: spec.color,
    icon: spec.icon,
    url,
    deepLink,
    source,
    isPrimary: prefs.primary === spec.id,
    isEnabled: enabledSet.has(spec.id),
    logoDomain: resolveLogoDomain(spec),
    iconUrl: spec.iconUrl,
    monogram: spec.monogram,
  };
}

function extractHostFromUrl(url: string): string | null {
  try {
    return new URL(url).host.toLowerCase() || null;
  } catch {
    return null;
  }
}

function monogramFromLabel(label: string): string {
  const trimmed = label.trim();
  if (!trimmed) return '?';
  // Prefer the first non-space char + the first letter of a second word, if
  // any (e.g. "Prime Video" → "PV"). Otherwise just the first character.
  const parts = trimmed.split(/\s+/);
  if (parts.length >= 2 && parts[0] && parts[1]) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return parts[0][0].toUpperCase();
}
