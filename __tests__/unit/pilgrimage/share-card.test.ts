import { describe, expect, it } from 'bun:test';
import {
  formatShareLocation,
  getShareMatchScore,
  getShareSceneName,
} from '../../../libs/services/pilgrimage/share-card';

describe('share card metadata', () => {
  it('uses a generic scene fallback instead of a hardcoded anime title', () => {
    expect(getShareSceneName({})).toBe('原作場景');
    expect(getShareSceneName({ name: '駅前の坂道' })).toBe('駅前の坂道');
  });

  it('treats 0 as a real match score and never invents a fallback score', () => {
    expect(getShareMatchScore({ matchScore: '0' })).toBe(0);
    expect(getShareMatchScore({ matchScore: '72' })).toBe(72);
    expect(getShareMatchScore({})).toBeNull();
    expect(getShareMatchScore({ matchScore: '' })).toBeNull();
  });

  it('only formats coordinates when real spot coordinates are present', () => {
    expect(formatShareLocation({ spotLat: '35.0316', spotLng: '135.7721' })).toBe(
      '35.0316°, 135.7721°'
    );
    expect(formatShareLocation({ spotLat: '35.0316' })).toBeNull();
    expect(formatShareLocation({ spotLat: 'not-a-number', spotLng: '135.7721' })).toBeNull();
  });
});
