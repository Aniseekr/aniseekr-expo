// Reducer tests for usePilgrimageDetailData.
//
// Phase 4: the reducer added a `series_full_loaded` action so the screen
// renders the merged detailed-points tree once instead of N times. These
// tests pin the legacy `detailed_points_loaded` behavior (per-subject patch)
// AND the new collapsed update, so a future refactor cannot quietly remove
// either path.

import { describe, expect, it } from 'bun:test';
import {
  INITIAL_DETAIL_LOAD_STATE,
  detailLoadReducer,
  type DetailLoadState,
} from '../../../hooks/usePilgrimageDetailData';
import type {
  PilgrimageSeriesEntry,
  PilgrimageSeriesPoint,
} from '../../../libs/services/pilgrimage/pilgrimage-series';

function entry(
  subjectId: number,
  label: string,
  pointsCount: number,
  withAnime = true
): PilgrimageSeriesEntry {
  const points: PilgrimageSeriesPoint[] = [];
  for (let i = 0; i < pointsCount; i += 1) {
    points.push({
      id: `s${subjectId}-p${i}`,
      name: `Spot ${i}`,
      image: `https://img/${subjectId}-${i}.jpg`,
      ep: i + 1,
      s: 0,
      geo: [35.6, 139.7],
      sourceBangumiId: subjectId,
      sourceAnimeTitle: `Title ${subjectId}`,
      sourceLabel: label,
    });
  }
  return {
    subject: {
      id: subjectId,
      label,
      title: `Title ${subjectId}`,
      titleCn: `中字 ${subjectId}`,
      relation: 'sequel',
      date: null,
      platform: null,
    },
    anime: withAnime
      ? ({
          id: subjectId,
          title: `Title ${subjectId}`,
          cn: `中字 ${subjectId}`,
          city: '',
          cover: '',
          color: '#FF9F0A',
          geo: [35.6, 139.7],
          zoom: 12,
          modified: 0,
          litePoints: points.slice(0, 3),
          pointsLength: pointsCount,
          imagesLength: pointsCount,
        } as PilgrimageSeriesEntry['anime'])
      : null,
    points,
  };
}

describe('detailLoadReducer', () => {
  it('starts loading', () => {
    expect(INITIAL_DETAIL_LOAD_STATE).toEqual({
      seriesEntries: [],
      loading: true,
      error: null,
    });
  });

  it('handles invalid_id', () => {
    const next = detailLoadReducer(INITIAL_DETAIL_LOAD_STATE, { type: 'invalid_id' });
    expect(next.error).toBe('Invalid anime id');
    expect(next.loading).toBe(false);
  });

  it('series_loaded replaces entries and clears loading', () => {
    const e1 = entry(101, 'S1', 2);
    const next = detailLoadReducer(INITIAL_DETAIL_LOAD_STATE, {
      type: 'series_loaded',
      entries: [e1],
    });
    expect(next.seriesEntries).toEqual([e1]);
    expect(next.loading).toBe(false);
    expect(next.error).toBeNull();
  });

  it('detailed_points_loaded patches only the matching subject', () => {
    const e1 = entry(101, 'S1', 1);
    const e2 = entry(102, 'S2', 1);
    const loaded: DetailLoadState = {
      ...INITIAL_DETAIL_LOAD_STATE,
      loading: false,
      seriesEntries: [e1, e2],
    };
    const detailed: PilgrimageSeriesPoint[] = [
      {
        id: 's101-p99',
        name: 'NewSpot',
        image: 'https://img/x.jpg',
        ep: 9,
        s: 0,
        geo: [35.6, 139.7],
        sourceBangumiId: 101,
        sourceAnimeTitle: 'Title 101',
        sourceLabel: 'S1',
      },
    ];
    const next = detailLoadReducer(loaded, {
      type: 'detailed_points_loaded',
      subjectId: 101,
      points: detailed,
    });
    expect(next.seriesEntries[0].points).toEqual(detailed);
    expect(next.seriesEntries[1]).toBe(e2);
  });

  it('series_full_loaded replaces the whole entry list in one dispatch', () => {
    const previous: DetailLoadState = {
      ...INITIAL_DETAIL_LOAD_STATE,
      loading: false,
      seriesEntries: [entry(101, 'S1', 0)],
    };
    const merged = [entry(101, 'S1', 5), entry(102, 'S2', 3)];
    const next = detailLoadReducer(previous, {
      type: 'series_full_loaded',
      entries: merged,
    });
    expect(next.seriesEntries).toEqual(merged);
    expect(next.loading).toBe(false);
    expect(next.error).toBeNull();
  });

  it('empty clears everything', () => {
    const previous: DetailLoadState = {
      ...INITIAL_DETAIL_LOAD_STATE,
      loading: false,
      seriesEntries: [entry(101, 'S1', 0)],
    };
    const next = detailLoadReducer(previous, { type: 'empty' });
    expect(next.seriesEntries).toEqual([]);
  });

  it('error keeps existing entries but flags the message', () => {
    const previous: DetailLoadState = {
      ...INITIAL_DETAIL_LOAD_STATE,
      loading: false,
      seriesEntries: [entry(101, 'S1', 1)],
    };
    const next = detailLoadReducer(previous, { type: 'error', message: 'Boom' });
    expect(next.error).toBe('Boom');
    expect(next.seriesEntries.length).toBe(1);
  });

  it('loading is a no-op when already loading without error', () => {
    const previous: DetailLoadState = {
      seriesEntries: [],
      loading: true,
      error: null,
    };
    const next = detailLoadReducer(previous, { type: 'loading' });
    expect(next).toBe(previous);
  });

  it('error is a no-op when message and state are unchanged', () => {
    const previous: DetailLoadState = {
      seriesEntries: [],
      loading: false,
      error: 'Boom',
    };
    const next = detailLoadReducer(previous, { type: 'error', message: 'Boom' });
    expect(next).toBe(previous);
  });
});
