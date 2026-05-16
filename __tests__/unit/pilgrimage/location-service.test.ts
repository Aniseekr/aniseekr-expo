// Deterministic unit tests for LocationService.
// Spec cases: PILG-LOC-001 (haversine), PILG-LOC-002 (cache), PILG-LOC-003 (denied permission).

import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';

import {
  LocationService,
  resolveHeadingDegrees,
} from '../../../libs/services/pilgrimage/location-service';

interface FakePermission {
  status: 'granted' | 'denied' | 'undetermined';
  canAskAgain: boolean;
}

interface FakeLocationModule {
  Accuracy: { Balanced: number };
  requestForegroundPermissionsAsync: ReturnType<typeof mock>;
  getForegroundPermissionsAsync: ReturnType<typeof mock>;
  getCurrentPositionAsync: ReturnType<typeof mock>;
  watchPositionAsync: ReturnType<typeof mock>;
}

const buildFakeModule = (): FakeLocationModule => ({
  Accuracy: { Balanced: 3 },
  requestForegroundPermissionsAsync: mock(
    async (): Promise<FakePermission> => ({ status: 'granted', canAskAgain: true })
  ),
  getForegroundPermissionsAsync: mock(
    async (): Promise<FakePermission> => ({ status: 'granted', canAskAgain: true })
  ),
  getCurrentPositionAsync: mock(async (_opts: unknown) => ({
    coords: { latitude: 35.6895, longitude: 139.6917 },
  })),
  watchPositionAsync: mock(async (_opts: unknown, _cb: unknown) => ({
    remove: () => undefined,
  })),
});

let fakeModule: FakeLocationModule;

mock.module('expo-location', () => {
  if (!fakeModule) fakeModule = buildFakeModule();
  return fakeModule;
});

describe('LocationService', () => {
  beforeEach(() => {
    fakeModule = buildFakeModule();
  });

  afterEach(() => {
    mock.restore();
  });

  it('PILG-LOC-001 getDistanceKm computes Tokyo→Kyoto at roughly 370km', () => {
    const svc = LocationService.resetForTests({
      module: fakeModule as unknown as typeof import('expo-location'),
    });
    const tokyo = { latitude: 35.6895, longitude: 139.6917 };
    const kyoto = { latitude: 35.0116, longitude: 135.7681 };
    const dist = svc.getDistanceKm(tokyo, kyoto);
    // Real-world haversine result is ~364km; allow ±15km for floating point.
    expect(dist).toBeGreaterThan(350);
    expect(dist).toBeLessThan(380);
  });

  it('PILG-LOC-001b getDistanceKm returns 0 for identical points', () => {
    const svc = LocationService.resetForTests({
      module: fakeModule as unknown as typeof import('expo-location'),
    });
    const point = { latitude: 35.6895, longitude: 139.6917 };
    expect(svc.getDistanceKm(point, point)).toBe(0);
  });

  it('PILG-LOC-001c getDistanceKm returns NaN for invalid input', () => {
    const svc = LocationService.resetForTests({
      module: fakeModule as unknown as typeof import('expo-location'),
    });
    const result = svc.getDistanceKm(
      { latitude: Number.NaN, longitude: 0 },
      { latitude: 0, longitude: 0 }
    );
    expect(Number.isNaN(result)).toBe(true);
  });

  it('PILG-LOC-002 caches the last fix for the configured TTL', async () => {
    let now = 1_700_000_000_000;
    const svc = LocationService.resetForTests({
      module: fakeModule as unknown as typeof import('expo-location'),
      now: () => now,
      cacheTtlMs: 60_000,
    });

    const first = await svc.getCurrentLocation();
    expect(first).toEqual({ latitude: 35.6895, longitude: 139.6917 });
    expect(fakeModule.getCurrentPositionAsync).toHaveBeenCalledTimes(1);

    // Within TTL — must be cached.
    now += 30_000;
    const second = await svc.getCurrentLocation();
    expect(second).toEqual(first);
    expect(fakeModule.getCurrentPositionAsync).toHaveBeenCalledTimes(1);

    // Past TTL — must refetch.
    now += 31_000;
    const third = await svc.getCurrentLocation();
    expect(third).not.toBeNull();
    expect(fakeModule.getCurrentPositionAsync).toHaveBeenCalledTimes(2);
  });

  it('PILG-LOC-003 returns null when foreground permission is denied', async () => {
    fakeModule.getForegroundPermissionsAsync.mockResolvedValue({
      status: 'denied',
      canAskAgain: false,
    });
    fakeModule.requestForegroundPermissionsAsync.mockResolvedValue({
      status: 'denied',
      canAskAgain: false,
    });

    const svc = LocationService.resetForTests({
      module: fakeModule as unknown as typeof import('expo-location'),
    });

    const result = await svc.getCurrentLocation();
    expect(result).toBeNull();
    expect(fakeModule.getCurrentPositionAsync).not.toHaveBeenCalled();
  });

  it('PILG-LOC-003b returns null when getCurrentPositionAsync throws', async () => {
    fakeModule.getCurrentPositionAsync.mockRejectedValue(new Error('GPS off'));

    const svc = LocationService.resetForTests({
      module: fakeModule as unknown as typeof import('expo-location'),
    });

    const result = await svc.getCurrentLocation();
    expect(result).toBeNull();
  });

  it('PILG-LOC-004 requestPermission returns true for granted status', async () => {
    const svc = LocationService.resetForTests({
      module: fakeModule as unknown as typeof import('expo-location'),
    });
    expect(await svc.requestPermission()).toBe(true);

    fakeModule.requestForegroundPermissionsAsync.mockResolvedValue({
      status: 'denied',
      canAskAgain: true,
    });
    expect(await svc.requestPermission()).toBe(false);
  });
});

describe('resolveHeadingDegrees', () => {
  it('prefers true north when it is a usable value', () => {
    expect(resolveHeadingDegrees({ trueHeading: 91, magHeading: 88 })).toBe(91);
  });

  it('falls back to magnetic north when true heading is unavailable', () => {
    expect(resolveHeadingDegrees({ trueHeading: -1, magHeading: 270 })).toBe(270);
  });

  it('wraps values into the 0–360 range', () => {
    expect(resolveHeadingDegrees({ trueHeading: 360 })).toBe(0);
    expect(resolveHeadingDegrees({ trueHeading: 450 })).toBe(90);
  });

  it('returns null when no usable heading is present', () => {
    expect(resolveHeadingDegrees(null)).toBeNull();
    expect(resolveHeadingDegrees({ trueHeading: -1, magHeading: -1 })).toBeNull();
    expect(resolveHeadingDegrees({ trueHeading: Number.NaN })).toBeNull();
  });
});
