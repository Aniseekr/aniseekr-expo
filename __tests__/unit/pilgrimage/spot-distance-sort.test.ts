import { describe, expect, it } from 'bun:test';

import {
  getNearestSceneForSpot,
  getSpotDistanceKm,
  sortSpotsByDistance,
} from '../../../libs/services/pilgrimage/spot-distance-sort';
import type { LatLng } from '../../../libs/services/pilgrimage/location-service';
import type { AnitabiPoint, AnitabiSpot } from '../../../libs/services/pilgrimage/types';

const USER: LatLng = { latitude: 35.68, longitude: 139.76 };

function point(id: string, geo: [number, number], name = id): AnitabiPoint {
  return {
    id,
    name,
    image: `https://img/${id}.jpg`,
    ep: 1,
    s: 0,
    geo,
  };
}

function spot(id: string, scenes: AnitabiPoint[]): AnitabiSpot {
  const head = scenes[0];
  return {
    id,
    name: head.name,
    geo: head.geo,
    image: head.image,
    scenes,
  };
}

describe('spot distance sorting', () => {
  it('sorts grouped spots nearest-first and puts missing geo at the end', () => {
    const far = spot('far', [point('far-scene', [35.9, 140.1])]);
    const missing = spot('missing', [point('missing-scene', [0, 0])]);
    const near = spot('near', [point('near-scene', [35.681, 139.761])]);

    const sorted = sortSpotsByDistance([far, missing, near], USER);

    expect(sorted.map((s) => s.id)).toEqual(['near', 'far', 'missing']);
  });

  it('uses the nearest valid scene in a grouped location', () => {
    const grouped = spot('folder', [
      point('folder-head', [0, 0]),
      point('child-nearby', [35.6808, 139.7608]),
      point('child-farther', [35.71, 139.8]),
    ]);

    const distanceKm = getSpotDistanceKm(grouped, USER);

    expect(distanceKm).not.toBeNull();
    expect(distanceKm!).toBeLessThan(0.2);
  });

  it('preserves source order when user location is unavailable', () => {
    const first = spot('first', [point('first-scene', [35.9, 140.1])]);
    const second = spot('second', [point('second-scene', [35.681, 139.761])]);
    const input = [first, second];

    const sorted = sortSpotsByDistance(input, null);

    expect(sorted.map((s) => s.id)).toEqual(['first', 'second']);
    expect(sorted).not.toBe(input);
  });

  it('keeps stable order when distances tie', () => {
    const first = spot('first', [point('first-scene', [35.681, 139.761])]);
    const second = spot('second', [point('second-scene', [35.681, 139.761])]);

    const sorted = sortSpotsByDistance([first, second], USER);

    expect(sorted.map((s) => s.id)).toEqual(['first', 'second']);
  });

  it('picks the nearest valid scene as the current representative', () => {
    const grouped = spot('folder', [
      point('folder-head', [0, 0]),
      point('child-farther', [35.71, 139.8]),
      point('child-nearby', [35.6808, 139.7608]),
    ]);

    expect(getNearestSceneForSpot(grouped, USER).id).toBe('child-nearby');
  });

  it('falls back to the original representative without user location', () => {
    const grouped = spot('folder', [
      point('folder-head', [0, 0]),
      point('child-nearby', [35.6808, 139.7608]),
    ]);

    expect(getNearestSceneForSpot(grouped, null).id).toBe('folder-head');
  });
});
