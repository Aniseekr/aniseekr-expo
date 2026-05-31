// Pins the cluster visual rules ported verbatim from the Leaflet
// `__makeClusterGroup` (libs/services/pilgrimage/leaflet-map.ts) so the MapLibre
// engine's supercluster bubbles match today's dot/numbered look + tap behaviour.
import { describe, expect, it } from 'bun:test';
import {
  CLUSTER_RADIUS_PX,
  CLUSTER_PICKER_THRESHOLD,
  CLUSTER_DISABLE_AT,
  clusterMaxZoom,
  isDotCluster,
  clusterDotSize,
  clusterBubbleSize,
  formatClusterCount,
  dominantColor,
  clusterTapAction,
} from '../../../libs/services/pilgrimage/map-engine/cluster-style';

describe('clusterMaxZoom (supercluster maxZoom = disableClusteringAtZoom - 1)', () => {
  it('is one below the surface disable-at zoom', () => {
    expect(clusterMaxZoom(16)).toBe(15);
    expect(clusterMaxZoom(12)).toBe(11);
  });
});

describe('isDotCluster (zoom <= 8 || n < 10)', () => {
  it('is a dot when zoomed out far', () => {
    expect(isDotCluster(8, 500)).toBe(true);
    expect(isDotCluster(5, 1000)).toBe(true);
  });
  it('is a dot when the count is small', () => {
    expect(isDotCluster(12, 9)).toBe(true);
  });
  it('is a numbered bubble when zoomed in with enough members', () => {
    expect(isDotCluster(9, 10)).toBe(false);
    expect(isDotCluster(12, 10)).toBe(false);
  });
});

describe('clusterDotSize (n<5→12, n<25→16, n<100→20, else 24)', () => {
  it('buckets the dot diameter by member count', () => {
    expect(clusterDotSize(4)).toBe(12);
    expect(clusterDotSize(5)).toBe(16);
    expect(clusterDotSize(24)).toBe(16);
    expect(clusterDotSize(25)).toBe(20);
    expect(clusterDotSize(99)).toBe(20);
    expect(clusterDotSize(100)).toBe(24);
    expect(clusterDotSize(5000)).toBe(24);
  });
});

describe('clusterBubbleSize (n<50→34, n<200→42, else 50)', () => {
  it('buckets the numbered bubble diameter', () => {
    expect(clusterBubbleSize(10)).toBe(34);
    expect(clusterBubbleSize(49)).toBe(34);
    expect(clusterBubbleSize(50)).toBe(42);
    expect(clusterBubbleSize(199)).toBe(42);
    expect(clusterBubbleSize(200)).toBe(50);
  });
});

describe('formatClusterCount (>=1000 → "1.2k")', () => {
  it('shows the raw count below 1000', () => {
    expect(formatClusterCount(5)).toBe('5');
    expect(formatClusterCount(999)).toBe('999');
  });
  it('compacts thousands to one decimal + k', () => {
    expect(formatClusterCount(1000)).toBe('1.0k');
    expect(formatClusterCount(1234)).toBe('1.2k');
    expect(formatClusterCount(1999)).toBe('1.9k');
    expect(formatClusterCount(12345)).toBe('12.3k');
  });
});

describe('dominantColor (most-common region colour, fallback otherwise)', () => {
  it('picks the colour with the highest tally', () => {
    expect(dominantColor({ '#aa0000': 3, '#00bb00': 1 }, '#zzz')).toBe('#aa0000');
  });
  it('falls back when the tally is empty', () => {
    expect(dominantColor({}, '#fallback')).toBe('#fallback');
  });
});

describe('clusterTapAction (n > pickerThreshold → zoom, else picker)', () => {
  it('zooms into big clusters and opens a picker for small ones', () => {
    expect(clusterTapAction(13)).toBe('zoom');
    expect(clusterTapAction(12)).toBe('picker');
    expect(clusterTapAction(5)).toBe('picker');
  });
});

describe('constants', () => {
  it('match the Leaflet defaults', () => {
    expect(CLUSTER_PICKER_THRESHOLD).toBe(12);
    expect(CLUSTER_RADIUS_PX).toBe(48);
    expect(CLUSTER_DISABLE_AT.spot).toBe(16);
    expect(CLUSTER_DISABLE_AT.hub).toBe(12);
  });
});
