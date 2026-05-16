import { describe, expect, it } from 'bun:test';
import { choosePseudoHdrFallbackFrame } from '../../../libs/services/pilgrimage/pseudo-hdr';

describe('pseudo HDR helpers', () => {
  it('prefers the middle frame when a full HDR stack cannot be composited', () => {
    expect(
      choosePseudoHdrFallbackFrame([
        { uri: 'file://under.jpg', width: 100, height: 80 },
        { uri: 'file://mid.jpg', width: 101, height: 81 },
      ])
    ).toEqual({ uri: 'file://mid.jpg', width: 101, height: 81 });
  });

  it('falls back to the first real frame when only one capture succeeded', () => {
    expect(choosePseudoHdrFallbackFrame([{ uri: 'file://only.jpg', width: 90, height: 70 }])).toEqual(
      { uri: 'file://only.jpg', width: 90, height: 70 }
    );
  });

  it('returns null when no real frame was captured', () => {
    expect(choosePseudoHdrFallbackFrame([])).toBeNull();
  });
});
