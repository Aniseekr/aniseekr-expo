import { describe, expect, it } from 'bun:test';

import { rankFeaturedSpotsByPriority } from '../../../libs/services/pilgrimage/featured-spots';

interface SpotCandidate {
  id: string;
  distanceKm?: number;
  planned?: boolean;
  fromCollection?: boolean;
}

describe('featured pilgrimage spot ranking', () => {
  it('prioritizes nearby spots while giving planned spots a bounded boost', () => {
    const ranked = rankFeaturedSpotsByPriority<SpotCandidate>([
      { id: 'near', distanceKm: 2 },
      { id: 'planned-nearby', distanceKm: 15, planned: true },
      { id: 'planned-far', distanceKm: 120, planned: true },
      { id: 'middle', distanceKm: 30 },
      { id: 'unknown-distance', planned: true },
    ]);

    expect(ranked.map((spot) => spot.id)).toEqual([
      'planned-nearby',
      'near',
      'middle',
      'planned-far',
      'unknown-distance',
    ]);
  });

  it('uses collection as a smaller tie-breaker and preserves stable order after scores tie', () => {
    const ranked = rankFeaturedSpotsByPriority<SpotCandidate>([
      { id: 'first', distanceKm: 10 },
      { id: 'collection', distanceKm: 12, fromCollection: true },
      { id: 'same-score-a', distanceKm: 40 },
      { id: 'same-score-b', distanceKm: 40 },
    ]);

    expect(ranked.map((spot) => spot.id)).toEqual([
      'collection',
      'first',
      'same-score-a',
      'same-score-b',
    ]);
  });
});
