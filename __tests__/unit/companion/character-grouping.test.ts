// Track D Phase 2 — multi-angle character grouping.
//
// A "character" can hold several angle variants (front / 3-4 / side). Variants
// share a `groupId`; legacy entries without one are singleton characters. The
// album groups by this, newest character first, newest variant first.

import { describe, expect, it } from 'bun:test';
import {
  groupCharacters,
  removeGroup,
  renameGroup,
  type CharacterEntry,
  type CharacterGroup,
} from '../../../libs/services/companion/character-library';

function mkChar(id: string, overrides: Partial<CharacterEntry> = {}): CharacterEntry {
  return {
    id,
    displayName: `Char ${id}`,
    sourceUri: `file:///source/${id}.png`,
    cutoutUri: `file:///cutout/${id}.png`,
    thumbUri: `file:///thumb/${id}.png`,
    intrinsicW: 512,
    intrinsicH: 768,
    createdAt: 1_700_000_000_000,
    ...overrides,
  };
}

describe('groupCharacters', () => {
  it('returns one group per legacy entry without a groupId', () => {
    const groups = groupCharacters([mkChar('a'), mkChar('b')]);
    expect(groups).toHaveLength(2);
    expect(groups.every((g: CharacterGroup) => g.variants.length === 1)).toBe(true);
  });

  it('uses the entry id as the groupId for singletons', () => {
    const [group] = groupCharacters([mkChar('solo')]);
    expect(group.groupId).toBe('solo');
    expect(group.cover.id).toBe('solo');
  });

  it('folds entries that share a groupId into a single character', () => {
    const entries = [
      mkChar('rem-front', {
        groupId: 'rem',
        displayName: 'Rem',
        angleLabel: 'Front',
        createdAt: 10,
      }),
      mkChar('rem-side', { groupId: 'rem', displayName: 'Rem', angleLabel: 'Side', createdAt: 30 }),
      mkChar('ram', { displayName: 'Ram', createdAt: 20 }),
    ];
    const groups = groupCharacters(entries);
    expect(groups).toHaveLength(2);

    const rem = groups.find((g) => g.groupId === 'rem')!;
    expect(rem.name).toBe('Rem');
    expect(rem.variants).toHaveLength(2);
    // newest variant first, and it is the cover
    expect(rem.variants[0].id).toBe('rem-side');
    expect(rem.cover.id).toBe('rem-side');
  });

  it('orders characters by their newest variant, newest first', () => {
    const entries = [
      mkChar('old', { createdAt: 100 }),
      mkChar('rem-a', { groupId: 'rem', createdAt: 50 }),
      mkChar('rem-b', { groupId: 'rem', createdAt: 500 }), // makes rem the newest character
    ];
    const groups = groupCharacters(entries);
    expect(groups[0].groupId).toBe('rem');
    expect(groups[1].groupId).toBe('old');
  });

  it('is stable for an empty library', () => {
    expect(groupCharacters([])).toEqual([]);
  });
});

describe('removeGroup / renameGroup', () => {
  it('removes every variant of a character', () => {
    const list = [
      mkChar('rem-a', { groupId: 'rem' }),
      mkChar('rem-b', { groupId: 'rem' }),
      mkChar('ram'),
    ];
    const next = removeGroup(list, 'rem');
    expect(next.map((c) => c.id)).toEqual(['ram']);
  });

  it('removes a legacy singleton by its own id', () => {
    const list = [mkChar('solo'), mkChar('keep')];
    expect(removeGroup(list, 'solo').map((c) => c.id)).toEqual(['keep']);
  });

  it('renames every variant of a character and trims', () => {
    const list = [
      mkChar('rem-a', { groupId: 'rem', displayName: 'old' }),
      mkChar('rem-b', { groupId: 'rem', displayName: 'old' }),
      mkChar('ram', { displayName: 'Ram' }),
    ];
    const next = renameGroup(list, 'rem', '  Rem  ');
    expect(next.filter((c) => c.groupId === 'rem').every((c) => c.displayName === 'Rem')).toBe(
      true
    );
    expect(next.find((c) => c.id === 'ram')!.displayName).toBe('Ram');
  });

  it('ignores a blank rename', () => {
    const list = [mkChar('a', { displayName: 'Keep' })];
    expect(renameGroup(list, 'a', '   ')).toEqual(list);
  });
});
