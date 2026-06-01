// MMKV-backed character library store. Reads sync at module load so a
// `useState` initialiser in a screen can paint the library on frame 1
// (CLAUDE.md rule 10), and writes the JSON back on every mutation.

import { kvGet, kvSet } from '../storage/app-storage';
import {
  CHARACTER_LIBRARY_FREE_LIMIT,
  addCharacter,
  groupCharacters,
  parseLibraryFromJson,
  removeCharacter,
  removeGroup,
  renameGroup,
  serializeLibraryToJson,
  type CharacterEntry,
  type CharacterGroup,
} from './character-library';

const STORAGE_KEY = 'aniseekr.companion.characters.v1';

type Listener = (list: CharacterEntry[]) => void;

let cache: CharacterEntry[] = parseLibraryFromJson(kvGet(STORAGE_KEY));
const listeners = new Set<Listener>();

function emit(): void {
  for (const fn of listeners) fn(cache);
}

function persist(): void {
  kvSet(STORAGE_KEY, serializeLibraryToJson(cache));
  emit();
}

export function getCharacters(): CharacterEntry[] {
  return cache;
}

/** Characters (angle variants folded together), newest first. */
export function getCharacterGroups(): CharacterGroup[] {
  return groupCharacters(cache);
}

export function getCharacterCount(): number {
  return cache.length;
}

export function getCharacterLimit(): number {
  return CHARACTER_LIBRARY_FREE_LIMIT;
}

/**
 * Returns `false` when the library is at quota and the entry is new
 * (re-imports of an existing id always go through). Caller surfaces the
 * "Library full" toast.
 */
export function upsertCharacter(entry: CharacterEntry): boolean {
  const result = addCharacter(cache, entry, CHARACTER_LIBRARY_FREE_LIMIT);
  if (result.rejected) return false;
  cache = result.list;
  persist();
  return true;
}

export function deleteCharacter(id: string): void {
  const next = removeCharacter(cache, id);
  if (next === cache) return;
  cache = next;
  persist();
}

/** Delete every angle variant of a character. */
export function deleteCharacterGroup(groupId: string): void {
  const next = removeGroup(cache, groupId);
  if (next === cache) return;
  cache = next;
  persist();
}

/** Rename a character (applies to all its angle variants). */
export function renameCharacterGroup(groupId: string, name: string): void {
  const next = renameGroup(cache, groupId, name);
  if (next === cache) return;
  cache = next;
  persist();
}

export function subscribeCharacters(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Test-only hook so the bun test suite can isolate cases. */
export function __resetCharacterStore(): void {
  cache = [];
  kvSet(STORAGE_KEY, '[]');
  emit();
}
