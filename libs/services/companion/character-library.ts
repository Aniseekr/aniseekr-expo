// Companion composer (Track D Phase 1) — character library reducer.
//
// The companion feature lets the user import a character image (ideally with
// alpha) and place it on top of a background as a Skia overlay. This file
// owns the *data* shape and pure add/remove/serialize logic. The MMKV-backed
// store wraps these helpers in companion/character-library-store.ts so the
// reducer can be unit-tested without touching native code.
//
// Per the plan:
//   - schema: { id, displayName, sourceUri, cutoutUri, thumbUri, intrinsicW/H, createdAt }
//   - free quota: 20 entries (cutout pngs live on FileSystem, MMKV only holds
//     metadata so the storage cost stays bounded)

export type CharacterEntry = {
  id: string;
  displayName: string;
  sourceUri: string;
  cutoutUri: string;
  thumbUri: string;
  intrinsicW: number;
  intrinsicH: number;
  createdAt: number;
  // ── Phase 2, additive (older entries omit these) ──────────────────────────
  /** Angle variants of one character share a groupId; legacy = own singleton. */
  groupId?: string;
  /** Free-text pose label, e.g. "Front" / "3⁄4" / "Side". */
  angleLabel?: string;
  /** True iff a real cutout (去背) was produced; false/absent = original as-is. */
  hasAlpha?: boolean;
};

/** A character = one or more angle variants folded together for the album. */
export interface CharacterGroup {
  /** Shared groupId, or the entry id for a singleton. */
  groupId: string;
  /** Display name (taken from the newest variant). */
  name: string;
  /** Representative entry (newest variant) used for the cover thumbnail. */
  cover: CharacterEntry;
  /** All angle variants, newest first. */
  variants: CharacterEntry[];
}

export const CHARACTER_LIBRARY_FREE_LIMIT = 20;

/** The groupId an entry belongs to — its own id when ungrouped (legacy). */
function effectiveGroupId(entry: CharacterEntry): string {
  return entry.groupId && entry.groupId.length > 0 ? entry.groupId : entry.id;
}

/**
 * Fold a flat entry list into characters. Variants sharing a groupId become one
 * character; legacy entries (no groupId) are singletons. Characters are ordered
 * by their newest variant (newest first), and variants within a character are
 * newest first — so the cover is always the most recently added angle.
 */
export function groupCharacters(list: CharacterEntry[]): CharacterGroup[] {
  const byGroup = new Map<string, CharacterEntry[]>();
  for (const entry of list) {
    const key = effectiveGroupId(entry);
    const bucket = byGroup.get(key);
    if (bucket) bucket.push(entry);
    else byGroup.set(key, [entry]);
  }

  const groups: CharacterGroup[] = [];
  for (const [groupId, variants] of byGroup) {
    const sorted = variants.slice().sort((a, b) => b.createdAt - a.createdAt);
    const cover = sorted[0];
    groups.push({ groupId, name: cover.displayName, cover, variants: sorted });
  }

  return groups.sort((a, b) => b.cover.createdAt - a.cover.createdAt);
}

export type AddCharacterResult = {
  list: CharacterEntry[];
  rejected: boolean;
};

/**
 * Add (or replace by id) a character entry. If the list is full and the id
 * is new, the request is rejected — the caller surfaces "Library full" so
 * users delete an entry before importing more. Re-imports of an existing id
 * always go through (treated as an update).
 */
export function addCharacter(
  list: CharacterEntry[],
  char: CharacterEntry,
  freeLimit: number
): AddCharacterResult {
  const idx = list.findIndex((c) => c.id === char.id);
  if (idx >= 0) {
    const next = list.slice();
    next[idx] = char;
    return { list: sortByCreatedAtDesc(next), rejected: false };
  }
  if (list.length >= freeLimit) {
    return { list, rejected: true };
  }
  return { list: sortByCreatedAtDesc([...list, char]), rejected: false };
}

export function removeCharacter(list: CharacterEntry[], id: string): CharacterEntry[] {
  const next = list.filter((c) => c.id !== id);
  // Return the same reference when nothing matched so the store's
  // `next === cache` guard can skip a redundant persist + emit.
  return next.length === list.length ? list : next;
}

/** Remove every angle variant belonging to a character. */
export function removeGroup(list: CharacterEntry[], groupId: string): CharacterEntry[] {
  const next = list.filter((c) => effectiveGroupId(c) !== groupId);
  return next.length === list.length ? list : next;
}

/** Rename a character — applies the new display name to all its variants. */
export function renameGroup(
  list: CharacterEntry[],
  groupId: string,
  name: string
): CharacterEntry[] {
  const trimmed = name.trim();
  if (!trimmed) return list;
  return list.map((c) => (effectiveGroupId(c) === groupId ? { ...c, displayName: trimmed } : c));
}

function sortByCreatedAtDesc(list: CharacterEntry[]): CharacterEntry[] {
  return list.slice().sort((a, b) => b.createdAt - a.createdAt);
}

export function serializeLibraryToJson(list: CharacterEntry[]): string {
  return JSON.stringify(list);
}

const REQUIRED_KEYS: (keyof CharacterEntry)[] = [
  'id',
  'displayName',
  'sourceUri',
  'cutoutUri',
  'thumbUri',
  'intrinsicW',
  'intrinsicH',
  'createdAt',
];

/**
 * Defensive parser — drops anything that isn't a complete `CharacterEntry`
 * shape. We'd rather show a smaller library than a half-broken row.
 */
export function parseLibraryFromJson(raw: string | null | undefined): CharacterEntry[] {
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const out: CharacterEntry[] = [];
  for (const item of parsed) {
    if (!item || typeof item !== 'object') continue;
    const candidate = item as Record<string, unknown>;
    if (!REQUIRED_KEYS.every((k) => k in candidate)) continue;
    if (typeof candidate.id !== 'string') continue;
    if (typeof candidate.displayName !== 'string') continue;
    if (typeof candidate.sourceUri !== 'string') continue;
    if (typeof candidate.cutoutUri !== 'string') continue;
    if (typeof candidate.thumbUri !== 'string') continue;
    if (typeof candidate.intrinsicW !== 'number') continue;
    if (typeof candidate.intrinsicH !== 'number') continue;
    if (typeof candidate.createdAt !== 'number') continue;
    const entry: CharacterEntry = {
      id: candidate.id,
      displayName: candidate.displayName,
      sourceUri: candidate.sourceUri,
      cutoutUri: candidate.cutoutUri,
      thumbUri: candidate.thumbUri,
      intrinsicW: candidate.intrinsicW,
      intrinsicH: candidate.intrinsicH,
      createdAt: candidate.createdAt,
    };
    // Optional Phase 2 fields — carried through only when well-typed.
    if (typeof candidate.groupId === 'string') entry.groupId = candidate.groupId;
    if (typeof candidate.angleLabel === 'string') entry.angleLabel = candidate.angleLabel;
    if (typeof candidate.hasAlpha === 'boolean') entry.hasAlpha = candidate.hasAlpha;
    out.push(entry);
  }
  return out;
}
