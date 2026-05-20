// Memo-equality + bridge-helper tests for the pilgrimage detail refactor.
//
// We import the pure equality / signature helpers from `_equality.ts` so the
// test runner doesn't have to load react-native, expo-image, or reanimated.
// That keeps the test file lightweight and decouples the perf invariant
// from rendering — if you add a new prop to a leaf component and forget to
// include it in the equality fn, the test below catches the drift the
// moment that prop actually changes.

import { describe, expect, it } from 'bun:test';
import {
  capturedCountForPoints,
  computeMarkerStructuralSignature,
  computeVisitedIdsKey,
  filterPillPropsEqual,
  flattenScenesFromGroups,
  hasIntentForSpot,
  sceneTilePropsEqual,
  seriesSwitchChipPropsEqual,
  spotChipPropsEqual,
  spotRowPropsEqual,
  statCellPropsEqual,
  visitedCountForPoints,
  type FilterPillEqualityProps,
  type MapMarkerStructural,
  type SceneTileEqualityProps,
  type SeriesSwitchChipEqualityProps,
  type SpotChipEqualityProps,
  type SpotRowEqualityProps,
  type StatCellEqualityProps,
} from '../../../components/pilgrimage/detail/_equality';
import type { AnitabiPoint, AnitabiSpot } from '../../../libs/services/pilgrimage/types';
import type { ThemePalette } from '../../../context/ThemeContext';
import type { SpotIntentMap } from '../../../libs/services/pilgrimage/spot-intents';
import type { PilgrimageCapture } from '../../../libs/services/pilgrimage/captures';

const sampleSpot: AnitabiPoint = {
  id: 'p1',
  name: 'Sample',
  image: 'https://img/1.jpg',
  ep: 1,
  s: 0,
  geo: [35.6, 139.7],
};

const theme = { __sentinel: 'theme' } as unknown as ThemePalette;

// Shared at module scope so equality compares stable references — handlers
// passed from the parent via useCallback are similarly stable in real usage.
const noop = () => undefined;

function sceneTileProps(
  overrides: Partial<SceneTileEqualityProps> = {}
): SceneTileEqualityProps {
  return {
    spot: sampleSpot,
    sceneCount: 1,
    themeColor: '#FF9F0A',
    themeColorFg: '#000',
    distanceKm: null,
    visited: false,
    saved: false,
    planned: false,
    hasCapture: false,
    captureUri: null,
    theme,
    onPress: noop,
    onToggleVisited: noop,
    onTakeComparison: noop,
    ...overrides,
  };
}

function spotRowProps(overrides: Partial<SpotRowEqualityProps> = {}): SpotRowEqualityProps {
  return {
    spot: sampleSpot,
    sceneCount: 1,
    themeColor: '#FF9F0A',
    themeColorFg: '#000',
    distanceKm: null,
    visited: false,
    saved: false,
    planned: false,
    hasCapture: false,
    captureUri: null,
    theme,
    onPress: noop,
    onToggleVisited: noop,
    onOpenMaps: noop,
    ...overrides,
  };
}

function spotChipProps(overrides: Partial<SpotChipEqualityProps> = {}): SpotChipEqualityProps {
  return {
    spot: sampleSpot,
    active: false,
    themeColor: '#FF9F0A',
    themeColorFg: '#000',
    distanceKm: null,
    visited: false,
    saved: false,
    planned: false,
    hasCapture: false,
    theme,
    onPress: noop,
    ...overrides,
  };
}

function filterPillProps(
  overrides: Partial<FilterPillEqualityProps> = {}
): FilterPillEqualityProps {
  return {
    label: 'All',
    active: false,
    badge: 3,
    themeColor: '#FF9F0A',
    themeColorFg: '#000',
    theme,
    onPress: noop,
    ...overrides,
  };
}

function seriesSwitchChipProps(
  overrides: Partial<SeriesSwitchChipEqualityProps> = {}
): SeriesSwitchChipEqualityProps {
  return {
    label: 'S1',
    sublabel: 'Season 1',
    active: false,
    disabled: false,
    themeColor: '#FF9F0A',
    themeColorFg: '#000',
    theme,
    onPress: noop,
    ...overrides,
  };
}

function statCellProps(overrides: Partial<StatCellEqualityProps> = {}): StatCellEqualityProps {
  return {
    icon: 'place',
    value: '12',
    label: 'scenes',
    color: '#FF9F0A',
    theme,
    ...overrides,
  };
}

describe('sceneTilePropsEqual', () => {
  it('returns true when no tracked prop changed', () => {
    expect(sceneTilePropsEqual(sceneTileProps(), sceneTileProps())).toBe(true);
  });

  it.each([
    ['visited', { visited: true }],
    ['sceneCount', { sceneCount: 5 }],
    ['themeColor', { themeColor: '#000' }],
    ['themeColorFg', { themeColorFg: '#fff' }],
    ['distanceKm', { distanceKm: 1.5 }],
    ['saved', { saved: true }],
    ['planned', { planned: true }],
    ['hasCapture', { hasCapture: true }],
    ['captureUri', { captureUri: 'file://x.jpg' }],
  ] as const)('returns false when %s changes', (_label, patch) => {
    expect(sceneTilePropsEqual(sceneTileProps(), sceneTileProps(patch))).toBe(false);
  });

  it('returns false when handlers change identity', () => {
    const otherNoop = () => undefined;
    expect(
      sceneTilePropsEqual(sceneTileProps(), sceneTileProps({ onPress: otherNoop }))
    ).toBe(false);
  });

  it('returns false when the underlying spot image changes', () => {
    const nextSpot: AnitabiPoint = { ...sampleSpot, image: 'https://img/2.jpg' };
    expect(sceneTilePropsEqual(sceneTileProps(), sceneTileProps({ spot: nextSpot }))).toBe(false);
  });

  it('returns false when the underlying spot name changes', () => {
    // Lite→detailed fetch can replace `spot.name` while keeping `id`+`image`.
    // The equality fn must catch this so the displayed title refreshes.
    const nextSpot: AnitabiPoint = { ...sampleSpot, name: 'Updated Name' };
    expect(sceneTilePropsEqual(sceneTileProps(), sceneTileProps({ spot: nextSpot }))).toBe(false);
  });
});

describe('spotRowPropsEqual', () => {
  it('returns true when no tracked prop changed', () => {
    expect(spotRowPropsEqual(spotRowProps(), spotRowProps())).toBe(true);
  });

  it('returns false when visited flips', () => {
    expect(spotRowPropsEqual(spotRowProps(), spotRowProps({ visited: true }))).toBe(false);
  });

  it('returns false when sceneCount changes', () => {
    expect(spotRowPropsEqual(spotRowProps({ sceneCount: 1 }), spotRowProps({ sceneCount: 3 }))).toBe(
      false
    );
  });

  it('returns false when the underlying spot name changes', () => {
    const nextSpot: AnitabiPoint = { ...sampleSpot, name: 'Updated' };
    expect(spotRowPropsEqual(spotRowProps(), spotRowProps({ spot: nextSpot }))).toBe(false);
  });

  it('returns false when captureUri changes', () => {
    // captureUri toggles the rows' single-image / REAL+ANIME split layout, so
    // the memo must invalidate when it flips between null and a real uri.
    expect(
      spotRowPropsEqual(spotRowProps(), spotRowProps({ captureUri: 'file://x.jpg' }))
    ).toBe(false);
  });
});

describe('spotChipPropsEqual', () => {
  it('returns true when no tracked prop changed', () => {
    expect(spotChipPropsEqual(spotChipProps(), spotChipProps())).toBe(true);
  });

  it('returns false when active flips', () => {
    expect(spotChipPropsEqual(spotChipProps(), spotChipProps({ active: true }))).toBe(false);
  });

  it('returns false when spot.ep changes', () => {
    const nextSpot = { ...sampleSpot, ep: 5 };
    expect(spotChipPropsEqual(spotChipProps(), spotChipProps({ spot: nextSpot }))).toBe(false);
  });
});

describe('filterPillPropsEqual', () => {
  it('returns true when no tracked prop changed', () => {
    expect(filterPillPropsEqual(filterPillProps(), filterPillProps())).toBe(true);
  });

  it.each([
    ['active', { active: true }],
    ['badge', { badge: 0 }],
    ['themeColor', { themeColor: '#000' }],
    ['label', { label: 'Visited' }],
    ['icon', { icon: 'flag' as const }],
  ] as const)('returns false when %s changes', (_label, patch) => {
    expect(filterPillPropsEqual(filterPillProps(), filterPillProps(patch))).toBe(false);
  });
});

describe('seriesSwitchChipPropsEqual', () => {
  it('returns true when no tracked prop changed', () => {
    expect(seriesSwitchChipPropsEqual(seriesSwitchChipProps(), seriesSwitchChipProps())).toBe(true);
  });

  it('returns false when active flips', () => {
    expect(
      seriesSwitchChipPropsEqual(
        seriesSwitchChipProps({ active: false }),
        seriesSwitchChipProps({ active: true })
      )
    ).toBe(false);
  });

  it('returns false when disabled flips', () => {
    expect(
      seriesSwitchChipPropsEqual(
        seriesSwitchChipProps({ disabled: false }),
        seriesSwitchChipProps({ disabled: true })
      )
    ).toBe(false);
  });
});

describe('statCellPropsEqual', () => {
  it('returns true when no tracked prop changed', () => {
    expect(statCellPropsEqual(statCellProps(), statCellProps())).toBe(true);
  });

  it('returns false when value changes', () => {
    expect(statCellPropsEqual(statCellProps({ value: '0' }), statCellProps({ value: '5' }))).toBe(
      false
    );
  });
});

// ---------------------------------------------------------------------
// SpotMapView bridge helpers (Phase 4).
// ---------------------------------------------------------------------

describe('SpotMapView marker bridge helpers', () => {
  const baseMarkers: MapMarkerStructural[] = [
    { id: 'a', ep: 1, image: 'i1', markerMode: 'photo', ringColor: '#ff0', visited: false },
    { id: 'b', ep: 2, image: 'i2', markerMode: 'photo', ringColor: '#ff0', visited: true },
  ];

  it('computeMarkerStructuralSignature ignores visited flag', () => {
    const a = computeMarkerStructuralSignature(baseMarkers);
    const flipped: MapMarkerStructural[] = baseMarkers.map((m) => ({ ...m, visited: !m.visited }));
    const b = computeMarkerStructuralSignature(flipped);
    expect(a).toBe(b);
  });

  it('computeMarkerStructuralSignature changes when ep or image changes', () => {
    const a = computeMarkerStructuralSignature(baseMarkers);
    const next: MapMarkerStructural[] = baseMarkers.map((m, i) =>
      i === 0 ? { ...m, image: 'iX' } : m
    );
    expect(a).not.toBe(computeMarkerStructuralSignature(next));
  });

  it('computeVisitedIdsKey returns sorted comma-joined visited ids', () => {
    const out = computeVisitedIdsKey([
      { id: 'z', ep: 1, image: '', markerMode: 'photo', ringColor: '', visited: true },
      { id: 'a', ep: 1, image: '', markerMode: 'photo', ringColor: '', visited: true },
      { id: 'm', ep: 1, image: '', markerMode: 'photo', ringColor: '', visited: false },
    ]);
    expect(out).toBe('a,z');
  });

  it('computeVisitedIdsKey returns empty string when no markers are visited', () => {
    expect(computeVisitedIdsKey([])).toBe('');
    expect(
      computeVisitedIdsKey([
        { id: 'a', ep: 1, image: '', markerMode: 'photo', ringColor: '', visited: false },
      ])
    ).toBe('');
  });
});

// ---------------------------------------------------------------------
// usePilgrimageInteractions: intent lookup helper.
// ---------------------------------------------------------------------

describe('hasIntentForSpot', () => {
  const spot: AnitabiPoint = sampleSpot;
  const otherScene: AnitabiPoint = { ...spot, id: 'p2' };
  const group: AnitabiSpot = {
    id: 'g1',
    name: 'Group',
    image: spot.image,
    geo: spot.geo,
    scenes: [spot, otherScene],
  };
  const spotIntents: SpotIntentMap = {
    p2: { saved: true },
  };

  it('returns true when any scene in the group has the intent', () => {
    expect(hasIntentForSpot({ spot, intent: 'saved', group, spotIntents })).toBe(true);
  });

  it('returns false when no scene in the group has the intent', () => {
    expect(hasIntentForSpot({ spot, intent: 'planned', group, spotIntents })).toBe(false);
  });

  it('falls back to spot id when group is undefined', () => {
    expect(
      hasIntentForSpot({
        spot,
        intent: 'saved',
        group: undefined,
        spotIntents: { p1: { saved: true } },
      })
    ).toBe(true);
    expect(
      hasIntentForSpot({
        spot,
        intent: 'planned',
        group: undefined,
        spotIntents: { p1: { saved: true } },
      })
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------
// Derived-spot pure helpers (Phase 4).
// ---------------------------------------------------------------------

describe('flattenScenesFromGroups', () => {
  const groupA: AnitabiSpot = {
    id: 'g1',
    name: 'A',
    image: 'i',
    geo: [0, 0],
    scenes: [
      { id: 'a1', name: 'A1', image: 'i', ep: 1, s: 0, geo: [0, 0] },
      { id: 'a2', name: 'A2', image: 'i', ep: 1, s: 0, geo: [0, 0] },
    ],
  };
  const groupB: AnitabiSpot = {
    id: 'g2',
    name: 'B',
    image: 'i',
    geo: [0, 0],
    scenes: [{ id: 'b1', name: 'B1', image: 'i', ep: 1, s: 0, geo: [0, 0] }],
  };

  it('flattens grouped scenes preserving order', () => {
    const out = flattenScenesFromGroups([groupA, groupB]);
    expect(out.map((s) => s.id)).toEqual(['a1', 'a2', 'b1']);
  });

  it('handles empty input', () => {
    expect(flattenScenesFromGroups([])).toEqual([]);
  });
});

describe('visitedCountForPoints / capturedCountForPoints', () => {
  const points: AnitabiPoint[] = [
    { id: 'p1', name: '', image: '', ep: 1, s: 0, geo: [0, 0] },
    { id: 'p2', name: '', image: '', ep: 1, s: 0, geo: [0, 0] },
    { id: 'p3', name: '', image: '', ep: 1, s: 0, geo: [0, 0] },
  ];

  it('counts only ids present in the visited map', () => {
    const visited: Record<string, true> = { p1: true, p3: true };
    expect(visitedCountForPoints(points, visited)).toBe(2);
  });

  it('returns 0 for empty visited / no overlap', () => {
    expect(visitedCountForPoints(points, {})).toBe(0);
    expect(visitedCountForPoints([], { p1: true })).toBe(0);
  });

  it('counts only ids present in the captures map', () => {
    const captures: Record<string, PilgrimageCapture> = {
      p2: {
        spotId: 'p2',
        uri: 'file://x.jpg',
        capturedAt: 0,
      },
    };
    expect(capturedCountForPoints(points, captures)).toBe(1);
  });
});
