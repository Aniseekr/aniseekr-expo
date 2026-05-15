import { describe, expect, it } from 'bun:test';
import {
  lensForFocalStop,
  stopsForAvailableLenses,
} from '../../../libs/services/pilgrimage/lens-switching';

describe('lens switching helpers', () => {
  it('maps physical iOS lenses to sorted focal stops without inventing missing lenses', () => {
    expect(
      stopsForAvailableLenses([
        'builtInTelephotoCamera',
        'builtInWideAngleCamera',
        'builtInUltraWideCamera',
      ])
    ).toEqual([0.5, 1, 3]);

    expect(stopsForAvailableLenses(['builtInWideAngleCamera'])).toEqual([1]);
    expect(stopsForAvailableLenses([])).toEqual([]);
  });

  it('respects older 2x telephoto mappings when requested', () => {
    expect(
      stopsForAvailableLenses(['builtInWideAngleCamera', 'builtInTelephotoCamera'], 2)
    ).toEqual([1, 2]);
  });

  it('returns null when a requested stop is not backed by the current device', () => {
    const available = ['builtInWideAngleCamera'];

    expect(lensForFocalStop(1, available)).toBe('builtInWideAngleCamera');
    expect(lensForFocalStop(3, available)).toBeNull();
  });
});
