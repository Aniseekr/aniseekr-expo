// MapLibre is a native module — it can't render headlessly, so the engine's
// behaviour is covered by the pure helper tests (marker-style, cluster-style,
// viewport, use-clustered-markers). This test just pins that the engine module
// evaluates cleanly (import paths, top-level code) under the maplibre mock.
import { describe, expect, it } from 'bun:test';
import { MapLibreEngine } from '../../../components/pilgrimage/map/engines/MapLibreEngine';

describe('MapLibreEngine module', () => {
  it('loads and exports a forwardRef component', () => {
    expect(MapLibreEngine).toBeDefined();
    expect(typeof MapLibreEngine).toBe('object');
  });
});
