// Geolocation service for the pilgrimage feature.
// Wraps `expo-location` with a 5-minute in-memory cache and graceful
// permission handling so callers can ask for "where am I?" without
// re-prompting on every render.
//
// See spec/pilgrimage_spec.md §9 (Nearby discovery).

import * as Location from 'expo-location';

/** A simple lat/lng pair (degrees). */
export interface LatLng {
  latitude: number;
  longitude: number;
}

/** Disposer returned by {@link LocationService.subscribeToUpdates}. */
export type Unsubscribe = () => void;

/** A raw compass-heading reading (subset of expo-location's heading shape). */
export interface HeadingReading {
  /** Heading vs. true (geographic) north; negative/absent when unavailable. */
  trueHeading?: number | null;
  /** Heading vs. magnetic north. */
  magHeading?: number | null;
}

/**
 * Normalise a compass-heading reading to a 0–360° bearing (0 = north,
 * increasing clockwise). Prefers true north and falls back to magnetic north;
 * returns `null` when neither value is usable so callers can render no
 * direction instead of a fake one.
 */
export function resolveHeadingDegrees(reading: HeadingReading | null | undefined): number | null {
  if (!reading) return null;
  for (const value of [reading.trueHeading, reading.magHeading]) {
    if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
      return ((value % 360) + 360) % 360;
    }
  }
  return null;
}

interface ServiceOptions {
  /** Override now() (used by tests for cache TTL boundaries). */
  now?: () => number;
  /** Override the underlying expo-location module (used by tests). */
  module?: typeof Location;
  /** Override the cache TTL. Defaults to 5 minutes. */
  cacheTtlMs?: number;
}

/** Default cached-location TTL (5 minutes). */
const LOCATION_CACHE_TTL_MS = 5 * 60 * 1000;

/** Earth's radius (km) used in the haversine distance formula. */
const EARTH_RADIUS_KM = 6371;

const toRadians = (deg: number): number => (deg * Math.PI) / 180;

/**
 * Singleton wrapper around `expo-location`.
 * - Caches the last-known location for {@link LOCATION_CACHE_TTL_MS}
 * - Returns `null` (instead of throwing) when permission is denied
 *   or the device cannot deliver a fix
 */
export class LocationService {
  private static _instance: LocationService | null = null;

  private now: () => number;
  private module: typeof Location;
  private cacheTtlMs: number;

  private cached: { value: LatLng; at: number } | null = null;

  constructor(opts: ServiceOptions = {}) {
    this.now = opts.now ?? (() => Date.now());
    this.module = opts.module ?? Location;
    this.cacheTtlMs = opts.cacheTtlMs ?? LOCATION_CACHE_TTL_MS;
  }

  /** Process-wide singleton accessor. */
  static getInstance(): LocationService {
    if (!LocationService._instance) {
      LocationService._instance = new LocationService();
    }
    return LocationService._instance;
  }

  /** Reset the singleton + clear the cache. Test-only seam. */
  static resetForTests(opts: ServiceOptions = {}): LocationService {
    LocationService._instance = new LocationService(opts);
    return LocationService._instance;
  }

  /**
   * Ask the OS for foreground location permission.
   * Returns true when the user grants access.
   */
  async requestPermission(): Promise<boolean> {
    try {
      const result = await this.module.requestForegroundPermissionsAsync();
      return result.status === 'granted';
    } catch (err) {
      console.warn('[LocationService] requestPermission failed:', err);
      return false;
    }
  }

  /**
   * Synchronous accessor for the in-memory cache. Used on the render path so
   * the locate FAB can paint a stale-but-known user dot on frame 1 instead of
   * showing nothing while a fresh fix resolves. Returns `null` when nothing
   * has been cached yet (cold start before any successful `getCurrentLocation`
   * or `getLastKnown` call).
   */
  getCached(): LatLng | null {
    if (!this.cached) return null;
    if (this.now() - this.cached.at >= this.cacheTtlMs) return null;
    return this.cached.value;
  }

  /**
   * Best-effort "where were we last?" without prompting for permission and
   * without spinning up GPS. Used to seed the user dot on first paint so the
   * FAB doesn't sit on "no location" for the ~1–3 s a cold fix takes. Reads
   * the OS's last-known position (which itself can be a few minutes stale);
   * returns `null` when the OS has nothing.
   *
   * Skipping the permission prompt is deliberate — we only want to use this
   * when permission has already been granted. Callers that need to *request*
   * permission still go through `getCurrentLocation`.
   */
  async getLastKnown(): Promise<LatLng | null> {
    try {
      const status = await this.module.getForegroundPermissionsAsync();
      if (status.status !== 'granted') return null;
    } catch {
      return null;
    }
    try {
      const fix = await this.module.getLastKnownPositionAsync({
        maxAge: this.cacheTtlMs,
      });
      if (!fix) return null;
      const value: LatLng = {
        latitude: fix.coords.latitude,
        longitude: fix.coords.longitude,
      };
      this.cached = { value, at: this.now() };
      return value;
    } catch (err) {
      console.warn('[LocationService] getLastKnown failed:', err);
      return null;
    }
  }

  /**
   * Resolve the user's current coordinates.
   * Returns the cached value when fresh, otherwise queries the OS.
   * Returns `null` when permission is denied or GPS is unavailable.
   */
  async getCurrentLocation(): Promise<LatLng | null> {
    // Fresh cache hit — short-circuit.
    if (this.cached && this.now() - this.cached.at < this.cacheTtlMs) {
      return this.cached.value;
    }

    let granted = false;
    try {
      const status = await this.module.getForegroundPermissionsAsync();
      granted = status.status === 'granted';
      if (!granted && status.canAskAgain) {
        granted = await this.requestPermission();
      }
    } catch (err) {
      console.warn('[LocationService] permission lookup failed:', err);
      return null;
    }

    if (!granted) return null;

    try {
      const fix = await this.module.getCurrentPositionAsync({
        accuracy: this.module.Accuracy?.Balanced ?? 3,
      });
      const value: LatLng = {
        latitude: fix.coords.latitude,
        longitude: fix.coords.longitude,
      };
      this.cached = { value, at: this.now() };
      return value;
    } catch (err) {
      console.warn('[LocationService] getCurrentLocation failed:', err);
      return null;
    }
  }

  /**
   * Great-circle distance between two coordinates, in kilometres.
   * Uses the haversine formula — accurate enough for "nearby" sorting.
   */
  getDistanceKm(a: LatLng, b: LatLng): number {
    if (
      !Number.isFinite(a.latitude) ||
      !Number.isFinite(a.longitude) ||
      !Number.isFinite(b.latitude) ||
      !Number.isFinite(b.longitude)
    ) {
      return Number.NaN;
    }

    const dLat = toRadians(b.latitude - a.latitude);
    const dLng = toRadians(b.longitude - a.longitude);
    const lat1 = toRadians(a.latitude);
    const lat2 = toRadians(b.latitude);

    const sinDLat = Math.sin(dLat / 2);
    const sinDLng = Math.sin(dLng / 2);
    const h = sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLng * sinDLng;

    return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
  }

  /**
   * Subscribe to location updates. Returns a disposer.
   * Falls back to a no-op when permission is missing or the platform
   * cannot start a watcher.
   */
  subscribeToUpdates(
    callback: (loc: LatLng) => void,
    options: { distanceIntervalMeters?: number; timeIntervalMs?: number } = {}
  ): Unsubscribe {
    let cancelled = false;
    let watcher: { remove: () => void } | null = null;

    (async () => {
      const granted = await this.requestPermission();
      if (!granted || cancelled) return;
      try {
        watcher = await this.module.watchPositionAsync(
          {
            accuracy: this.module.Accuracy?.Balanced ?? 3,
            distanceInterval: options.distanceIntervalMeters ?? 50,
            timeInterval: options.timeIntervalMs ?? 10_000,
          },
          (fix) => {
            const value: LatLng = {
              latitude: fix.coords.latitude,
              longitude: fix.coords.longitude,
            };
            this.cached = { value, at: this.now() };
            callback(value);
          }
        );
      } catch (err) {
        console.warn('[LocationService] watchPositionAsync failed:', err);
      }
    })();

    return () => {
      cancelled = true;
      watcher?.remove();
      watcher = null;
    };
  }

  /**
   * Subscribe to device compass-heading updates. The callback receives a
   * 0–360° bearing (0 = north, clockwise). Returns a disposer. Falls back to a
   * no-op when the platform cannot deliver a heading (e.g. a simulator with no
   * magnetometer) — the caller then simply shows no direction.
   */
  subscribeToHeading(callback: (headingDegrees: number) => void): Unsubscribe {
    let cancelled = false;
    let watcher: { remove: () => void } | null = null;

    (async () => {
      try {
        const sub = await this.module.watchHeadingAsync((reading) => {
          const degrees = resolveHeadingDegrees(reading);
          if (degrees !== null) callback(degrees);
        });
        if (cancelled) {
          sub.remove();
          return;
        }
        watcher = sub;
      } catch (err) {
        console.warn('[LocationService] watchHeadingAsync failed:', err);
      }
    })();

    return () => {
      cancelled = true;
      watcher?.remove();
      watcher = null;
    };
  }

  /** Drop the in-memory cache (useful when permissions change). */
  clearCache(): void {
    this.cached = null;
  }
}

export const locationService = LocationService.getInstance();
