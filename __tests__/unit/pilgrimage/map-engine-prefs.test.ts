// Behavioural pin for the map ENGINE rollout switch (spec D11).
// - Default MUST be 'leaflet' so the shipping app is unchanged until the
//   MapLibre engine is validated on-device (the P1 spike). Flipping the flag is
//   how a surface opts into MapLibre — never automatic.
// - Persists across loads; sync read seeds the first frame (Rule 10).
// - Subscribers fire on change so a settings toggle repaints in place.

import { beforeEach, describe, expect, it } from 'bun:test';
import { appStorage, __resetAppStorageForTests } from '../../../libs/services/storage/app-storage';
import {
  DEFAULT_MAP_ENGINE,
  loadMapEngine,
  loadMapEngineSync,
  setMapEngine,
  subscribeMapEngine,
} from '../../../libs/services/pilgrimage/map-engine-prefs';

beforeEach(() => {
  appStorage.clearAll();
  __resetAppStorageForTests();
});

describe('DEFAULT_MAP_ENGINE', () => {
  it('defaults to leaflet so the app is unchanged until the MapLibre device spike', () => {
    expect(DEFAULT_MAP_ENGINE).toBe('leaflet');
    expect(loadMapEngineSync()).toBe('leaflet');
  });
});

describe('loadMapEngine / setMapEngine', () => {
  it('persists the chosen engine across loads (sync reflects latest)', async () => {
    await setMapEngine('maplibre');
    expect(await loadMapEngine()).toBe('maplibre');
    expect(loadMapEngineSync()).toBe('maplibre');
  });

  it('ignores an unknown value and keeps the default', async () => {
    appStorage.set('aniseekr.pilgrimage.mapEngine.v1', 'bogus');
    expect(loadMapEngineSync()).toBe('leaflet');
  });
});

describe('subscribeMapEngine', () => {
  it('notifies on change and stops after unsubscribe', async () => {
    const seen: string[] = [];
    const unsub = subscribeMapEngine((next) => seen.push(next));
    await setMapEngine('maplibre');
    unsub();
    await setMapEngine('leaflet');
    expect(seen).toEqual(['maplibre']);
  });
});
