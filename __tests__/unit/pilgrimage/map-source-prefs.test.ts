// Behavioural pin for the pilgrimage map tile/style SOURCE seam (spec D7).
// - The configured style URL is a single indirection point, never hardcoded in
//   the engine — so we can (a) swap OpenFreeMap -> our Worker+R2 later with a
//   config flip, and (b) escape-hatch off OFM if it sunsets/limits, both with
//   no app release.
// - Phase 1 default = OpenFreeMap (decision 2026-05-31), for both map modes.
// - An override wins over the default regardless of mode (the swap / escape).
// - A blank/whitespace override is ignored so a bad remote-config value can
//   never blank the map (Rule 8: never a broken/empty render from bad data).
// - The synchronous read must reflect the latest persisted value (Rule 10:
//   seed the engine's style on the first frame, no flash/re-resolve).
// - Subscribers fire on change so a settings toggle / remote push repaints.

import { beforeEach, describe, expect, it } from 'bun:test';
import { appStorage, __resetAppStorageForTests } from '../../../libs/services/storage/app-storage';
import {
  DEFAULT_MAP_STYLE_URLS,
  resolveMapStyleUrl,
  loadMapStyleOverride,
  loadMapStyleOverrideSync,
  setMapStyleOverride,
  subscribeMapStyleOverride,
} from '../../../libs/services/pilgrimage/map-source-prefs';

beforeEach(() => {
  appStorage.clearAll();
  __resetAppStorageForTests();
});

describe('DEFAULT_MAP_STYLE_URLS', () => {
  it('defaults both modes to OpenFreeMap (Phase 1 source decision)', () => {
    expect(DEFAULT_MAP_STYLE_URLS.light).toContain('openfreemap');
    expect(DEFAULT_MAP_STYLE_URLS.dark).toContain('openfreemap');
  });
});

describe('resolveMapStyleUrl', () => {
  it('returns the per-mode OpenFreeMap default when there is no override', () => {
    expect(resolveMapStyleUrl('light', null)).toBe(DEFAULT_MAP_STYLE_URLS.light);
    expect(resolveMapStyleUrl('dark', null)).toBe(DEFAULT_MAP_STYLE_URLS.dark);
    expect(resolveMapStyleUrl('light', undefined)).toBe(DEFAULT_MAP_STYLE_URLS.light);
  });

  it('lets an override win over the default, regardless of mode (the swap / escape hatch)', () => {
    const custom = 'https://tiles.aniseekr.app/styles/voyager.json';
    expect(resolveMapStyleUrl('light', custom)).toBe(custom);
    expect(resolveMapStyleUrl('dark', custom)).toBe(custom);
  });

  it('ignores a blank/whitespace override so bad config never blanks the map', () => {
    expect(resolveMapStyleUrl('light', '')).toBe(DEFAULT_MAP_STYLE_URLS.light);
    expect(resolveMapStyleUrl('dark', '   ')).toBe(DEFAULT_MAP_STYLE_URLS.dark);
  });
});

describe('loadMapStyleOverride / setMapStyleOverride', () => {
  it('defaults to null (no override) when storage is empty', async () => {
    expect(await loadMapStyleOverride()).toBeNull();
    expect(loadMapStyleOverrideSync()).toBeNull();
  });

  it('persists the latest override across loads (sync reflects latest)', async () => {
    const url = 'https://tiles.aniseekr.app/styles/voyager.json';
    await setMapStyleOverride(url);
    expect(await loadMapStyleOverride()).toBe(url);
    expect(loadMapStyleOverrideSync()).toBe(url);
  });

  it('clears the override back to default when set to null', async () => {
    await setMapStyleOverride('https://tiles.aniseekr.app/styles/voyager.json');
    await setMapStyleOverride(null);
    expect(loadMapStyleOverrideSync()).toBeNull();
    expect(resolveMapStyleUrl('light', loadMapStyleOverrideSync())).toBe(
      DEFAULT_MAP_STYLE_URLS.light
    );
  });

  it('treats a blank string as clearing the override', async () => {
    await setMapStyleOverride('   ');
    expect(loadMapStyleOverrideSync()).toBeNull();
  });
});

describe('subscribeMapStyleOverride', () => {
  it('notifies subscribers on change and stops after unsubscribe', async () => {
    const received: (string | null)[] = [];
    const unsub = subscribeMapStyleOverride((next) => received.push(next));
    await setMapStyleOverride('https://a.example/s.json');
    unsub();
    await setMapStyleOverride('https://b.example/s.json');
    expect(received).toEqual(['https://a.example/s.json']);
  });
});
