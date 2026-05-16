import { afterEach, describe, expect, it } from 'bun:test';
import {
  addShot,
  buildLibraryCaptureSessionShot,
  clearSession,
  getShots,
  removeShot,
  sanitizeCaptureNote,
  subscribe,
  type CaptureSessionShot,
} from '../../../libs/services/pilgrimage/capture-session';

// Build a shot with sensible defaults; override only what the test cares about.
function makeShot(overrides: Partial<CaptureSessionShot> = {}): CaptureSessionShot {
  const createdAt = overrides.createdAt ?? Date.now();
  return {
    id: overrides.id ?? `${createdAt}-${Math.random()}`,
    uri: 'file:///tmp/shot.jpg',
    width: 1920,
    height: 1080,
    captureMode: 'single',
    source: 'manual',
    createdAt,
    heading: null,
    distanceMeters: null,
    headingDeltaDeg: null,
    tilt: null,
    userLocation: null,
    ...overrides,
  };
}

// The store is a module-level singleton — reset between tests so cases don't
// leak state into each other.
afterEach(() => {
  clearSession();
});

describe('capture-session store', () => {
  it('starts empty', () => {
    expect(getShots()).toEqual([]);
  });

  it('addShot prepends newest-first', () => {
    const first = makeShot({ id: 'a' });
    const second = makeShot({ id: 'b' });
    addShot(first);
    addShot(second);
    expect(getShots().map((s) => s.id)).toEqual(['b', 'a']);
  });

  it('removeShot drops the matching id and keeps the rest', () => {
    addShot(makeShot({ id: 'a' }));
    addShot(makeShot({ id: 'b' }));
    addShot(makeShot({ id: 'c' }));
    removeShot('b');
    expect(getShots().map((s) => s.id)).toEqual(['c', 'a']);
  });

  it('removeShot is a no-op for an unknown id', () => {
    addShot(makeShot({ id: 'a' }));
    const before = getShots();
    removeShot('missing');
    // Same array reference — nothing changed.
    expect(getShots()).toBe(before);
  });

  it('clearSession empties the store', () => {
    addShot(makeShot({ id: 'a' }));
    addShot(makeShot({ id: 'b' }));
    clearSession();
    expect(getShots()).toEqual([]);
  });

  it('preserves the full shot record including burst + sensor fields', () => {
    const shot = makeShot({
      id: 'burst-1',
      captureMode: 'burst',
      source: 'auto',
      heading: 182.4,
      distanceMeters: 12.5,
      headingDeltaDeg: -3.1,
      tilt: 1.2,
      userLocation: { latitude: 35.6812, longitude: 139.7671 },
      burstTotal: 6,
      burstUris: ['file:///0.jpg', 'file:///1.jpg'],
      burstBestIndex: 1,
    });
    addShot(shot);
    expect(getShots()[0]).toEqual(shot);
  });

  it('builds an imported library shot with real dimensions and GPS', () => {
    const shot = buildLibraryCaptureSessionShot({
      asset: { uri: 'file:///picked.jpg', width: 3024, height: 4032 },
      createdAt: 1710000000000,
      userLocation: { latitude: 35.6812, longitude: 139.7671 },
      heading: 92.4,
      distanceMeters: 18.5,
      headingDeltaDeg: -7.2,
      tilt: 1.5,
    });

    expect(shot).toEqual({
      id: 'library:1710000000000:file:///picked.jpg',
      uri: 'file:///picked.jpg',
      width: 3024,
      height: 4032,
      captureMode: 'single',
      source: 'library',
      createdAt: 1710000000000,
      heading: 92.4,
      distanceMeters: 18.5,
      headingDeltaDeg: -7.2,
      tilt: 1.5,
      userLocation: { latitude: 35.6812, longitude: 139.7671 },
    });
  });
});

describe('capture note sanitising', () => {
  it('trims and collapses user-entered notes before album persistence', () => {
    expect(sanitizeCaptureNote('  dusk   angle\nnear the ticket gate  ')).toBe(
      'dusk angle near the ticket gate'
    );
  });

  it('returns undefined for blank notes', () => {
    expect(sanitizeCaptureNote('  \n\t  ')).toBeUndefined();
  });
});

describe('snapshot stability', () => {
  it('returns the SAME array reference between reads with no mutation', () => {
    addShot(makeShot({ id: 'a' }));
    expect(getShots()).toBe(getShots());
  });

  it('returns a NEW reference after addShot', () => {
    const before = getShots();
    addShot(makeShot({ id: 'a' }));
    expect(getShots()).not.toBe(before);
  });

  it('returns a NEW reference after a removeShot that mutates', () => {
    addShot(makeShot({ id: 'a' }));
    const before = getShots();
    removeShot('a');
    expect(getShots()).not.toBe(before);
  });

  it('keeps the SAME reference when clearSession is called on an empty store', () => {
    const before = getShots();
    clearSession();
    expect(getShots()).toBe(before);
  });
});

describe('subscribe', () => {
  it('notifies listeners on addShot', () => {
    let calls = 0;
    const unsubscribe = subscribe(() => {
      calls += 1;
    });
    addShot(makeShot({ id: 'a' }));
    expect(calls).toBe(1);
    unsubscribe();
  });

  it('notifies listeners on removeShot and clearSession', () => {
    addShot(makeShot({ id: 'a' }));
    let calls = 0;
    const unsubscribe = subscribe(() => {
      calls += 1;
    });
    removeShot('a');
    addShot(makeShot({ id: 'b' }));
    clearSession();
    expect(calls).toBe(3);
    unsubscribe();
  });

  it('does not notify after unsubscribe', () => {
    let calls = 0;
    const unsubscribe = subscribe(() => {
      calls += 1;
    });
    unsubscribe();
    addShot(makeShot({ id: 'a' }));
    expect(calls).toBe(0);
  });

  it('does not notify for a no-op removeShot', () => {
    let calls = 0;
    const unsubscribe = subscribe(() => {
      calls += 1;
    });
    removeShot('missing');
    expect(calls).toBe(0);
    unsubscribe();
  });
});
