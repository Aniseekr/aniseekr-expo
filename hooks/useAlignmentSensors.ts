import { useEffect, useMemo, useRef, useState } from 'react';
import { DeviceMotion, Magnetometer } from 'expo-sensors';
import { useSharedValue, type SharedValue } from 'react-native-reanimated';
import { locationService, type LatLng } from '../libs/services/pilgrimage/location-service';
import {
  computeAlignmentScore,
  type AlignmentSensors,
} from '../libs/services/pilgrimage/alignment-scoring';
import {
  circularDegreesDelta,
  shouldPublishSensorSnapshot,
} from '../libs/services/pilgrimage/alignment-sensor-state';
import type { AlignmentScoreView } from '../components/pilgrimage/camera/types';
import { hapticsBridge } from '../modules/haptics/hapticsBridge';

interface UseAlignmentSensorsInput {
  spotLat: string | undefined;
  spotLng: string | undefined;
}

interface UseAlignmentSensorsOutput {
  score: AlignmentScoreView;
  userLocation: LatLng | null;
  heading: number | null;
  tilt: number | null;
  tiltShared: SharedValue<number>;
  lockedAt: number | null;
  perfectFiredAt: number | null;
  showPerfectBanner: boolean;
}

const FAST_INTERVAL_MS = 200;
const SLOW_INTERVAL_MS = 500;
const LOCK_THRESHOLD = 0.9;
const RELEASE_THRESHOLD = 0.85;
const SLOW_CONFIRM_MS = 800;
const PERFECT_DELAY_MS = 800;
const PERFECT_BANNER_MS = 1600;
const SENSOR_REACT_MIN_INTERVAL_MS = FAST_INTERVAL_MS;
const SENSOR_REACT_MAX_INTERVAL_MS = 1000;
const HEADING_REACT_DELTA_DEG = 1.5;
const TILT_REACT_DELTA_DEG = 0.75;

interface SensorSnapshotRef {
  value: number | null;
  publishedAtMs: number | null;
}

function bearingBetween(from: LatLng, to: LatLng): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const toDeg = (r: number) => (r * 180) / Math.PI;
  const phi1 = toRad(from.latitude);
  const phi2 = toRad(to.latitude);
  const dLambda = toRad(to.longitude - from.longitude);
  const y = Math.sin(dLambda) * Math.cos(phi2);
  const x = Math.cos(phi1) * Math.sin(phi2) - Math.sin(phi1) * Math.cos(phi2) * Math.cos(dLambda);
  const theta = Math.atan2(y, x);
  return (toDeg(theta) + 360) % 360;
}

export function useAlignmentSensors({
  spotLat,
  spotLng,
}: UseAlignmentSensorsInput): UseAlignmentSensorsOutput {
  const [userLocation, setUserLocation] = useState<LatLng | null>(null);
  const [heading, setHeading] = useState<number | null>(null);
  const [tilt, setTilt] = useState<number | null>(null);
  const [lockedAt, setLockedAt] = useState<number | null>(null);
  const [perfectFiredAt, setPerfectFiredAt] = useState<number | null>(null);
  const [showPerfectBanner, setShowPerfectBanner] = useState(false);

  const tiltShared = useSharedValue<number>(0);
  const bannerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const headingSnapshotRef = useRef<SensorSnapshotRef>({ value: null, publishedAtMs: null });
  const tiltSnapshotRef = useRef<SensorSnapshotRef>({ value: null, publishedAtMs: null });

  const targetLocation = useMemo<LatLng | null>(() => {
    const lat = Number(spotLat);
    const lng = Number(spotLng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return { latitude: lat, longitude: lng };
  }, [spotLat, spotLng]);

  useEffect(() => {
    let cancelled = false;
    locationService
      .getCurrentLocation()
      .then((loc) => {
        if (!cancelled && loc) setUserLocation(loc);
      })
      .catch(() => undefined);

    const unsubscribe = locationService.subscribeToUpdates(
      (loc) => {
        if (!cancelled) setUserLocation(loc);
      },
      { distanceIntervalMeters: 5, timeIntervalMs: 3000 }
    );
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  // Rate adaptation: start at 200ms, drop to 500ms after a sustained high
  // score, snap back immediately when score drops. Lives in refs so flips
  // don't trigger re-renders or restart subscriptions.
  const currentRateRef = useRef<number>(FAST_INTERVAL_MS);
  const magSubRef = useRef<{ remove: () => void } | null>(null);
  const motionSubRef = useRef<{ remove: () => void } | null>(null);
  const rateChangeRef = useRef<((next: number) => void) | null>(null);

  useEffect(() => {
    let cancelled = false;

    const subscribe = (intervalMs: number) => {
      Magnetometer.setUpdateInterval(intervalMs);
      magSubRef.current = Magnetometer.addListener((data) => {
        const angle = Math.atan2(data.y, data.x);
        let deg = (angle * 180) / Math.PI;
        deg = (90 - deg + 360) % 360;
        const snapshot = headingSnapshotRef.current;
        const nowMs = Date.now();
        if (
          shouldPublishSensorSnapshot({
            previousValue: snapshot.value,
            lastPublishedAtMs: snapshot.publishedAtMs,
            nextValue: deg,
            nowMs,
            minDelta: HEADING_REACT_DELTA_DEG,
            minIntervalMs: SENSOR_REACT_MIN_INTERVAL_MS,
            maxIntervalMs: SENSOR_REACT_MAX_INTERVAL_MS,
            delta: circularDegreesDelta,
          })
        ) {
          snapshot.value = deg;
          snapshot.publishedAtMs = nowMs;
          setHeading(deg);
        }
      });
      DeviceMotion.setUpdateInterval(intervalMs);
      DeviceMotion.isAvailableAsync()
        .then((ok) => {
          if (!ok || cancelled) return;
          motionSubRef.current = DeviceMotion.addListener((data) => {
            const pitch = data.rotation?.beta ?? 0;
            tiltShared.value = pitch;
            const deg = (pitch * 180) / Math.PI;
            const snapshot = tiltSnapshotRef.current;
            const nowMs = Date.now();
            if (
              shouldPublishSensorSnapshot({
                previousValue: snapshot.value,
                lastPublishedAtMs: snapshot.publishedAtMs,
                nextValue: deg,
                nowMs,
                minDelta: TILT_REACT_DELTA_DEG,
                minIntervalMs: SENSOR_REACT_MIN_INTERVAL_MS,
                maxIntervalMs: SENSOR_REACT_MAX_INTERVAL_MS,
              })
            ) {
              snapshot.value = deg;
              snapshot.publishedAtMs = nowMs;
              setTilt(deg);
            }
          });
        })
        .catch(() => undefined);
    };

    subscribe(FAST_INTERVAL_MS);
    currentRateRef.current = FAST_INTERVAL_MS;

    // Expose a re-subscribe seam for the rate-adapt effect below.
    // Some expo-sensors versions ignore setUpdateInterval after addListener,
    // so we tear down and re-add when changing rate.
    rateChangeRef.current = (next) => {
      if (currentRateRef.current === next) return;
      magSubRef.current?.remove();
      motionSubRef.current?.remove();
      magSubRef.current = null;
      motionSubRef.current = null;
      currentRateRef.current = next;
      subscribe(next);
    };

    return () => {
      cancelled = true;
      magSubRef.current?.remove();
      motionSubRef.current?.remove();
      magSubRef.current = null;
      motionSubRef.current = null;
      rateChangeRef.current = null;
    };
  }, [tiltShared]);

  useEffect(() => {
    return () => {
      if (bannerTimerRef.current !== null) {
        clearTimeout(bannerTimerRef.current);
        bannerTimerRef.current = null;
      }
    };
  }, []);

  const targetBearing = useMemo<number | null>(() => {
    if (!userLocation || !targetLocation) return null;
    return bearingBetween(userLocation, targetLocation);
  }, [userLocation, targetLocation]);

  const sensors = useMemo<AlignmentSensors>(
    () => ({ userLocation, targetLocation, heading, targetBearing, tilt }),
    [userLocation, targetLocation, heading, targetBearing, tilt]
  );

  const rawScore = useMemo(() => computeAlignmentScore(sensors), [sensors]);

  const score = useMemo<AlignmentScoreView>(
    () => ({
      total: rawScore.total,
      distanceMeters: rawScore.distanceMeters,
      headingDeltaDeg: rawScore.headingDeltaDeg,
      tiltDeg: tilt,
    }),
    [rawScore.total, rawScore.distanceMeters, rawScore.headingDeltaDeg, tilt]
  );

  // Hysteresis lock: enter at >=0.9, only release below 0.85.
  useEffect(() => {
    const total = score.total;
    if (total == null) {
      if (lockedAt !== null) setLockedAt(null);
      return;
    }
    if (total >= LOCK_THRESHOLD && lockedAt === null) {
      setLockedAt(Date.now());
    } else if (total < RELEASE_THRESHOLD && lockedAt !== null) {
      setLockedAt(null);
    }
  }, [score.total, lockedAt]);

  // Perfect timer: fires haptic once after a brief sustained lock.
  useEffect(() => {
    if (lockedAt === null) return;
    if (perfectFiredAt !== null && perfectFiredAt >= lockedAt) return;
    const elapsed = Date.now() - lockedAt;
    const delay = Math.max(0, PERFECT_DELAY_MS - elapsed);
    const timer = setTimeout(() => {
      if (lockedAt === null) return;
      hapticsBridge.success();
      setPerfectFiredAt(Date.now());
      setShowPerfectBanner(true);
      if (bannerTimerRef.current !== null) clearTimeout(bannerTimerRef.current);
      bannerTimerRef.current = setTimeout(() => {
        setShowPerfectBanner(false);
        bannerTimerRef.current = null;
      }, PERFECT_BANNER_MS);
    }, delay);
    return () => clearTimeout(timer);
  }, [lockedAt, perfectFiredAt]);

  // Rate-adapt: confirm a sustained high score over SLOW_CONFIRM_MS before
  // downshifting to 500ms. Drop back to 200ms immediately on a clear release
  // (total < 0.85) so the user gets fast feedback while re-aligning.
  useEffect(() => {
    const total = score.total;
    if (total != null && total < RELEASE_THRESHOLD) {
      if (currentRateRef.current !== FAST_INTERVAL_MS) {
        rateChangeRef.current?.(FAST_INTERVAL_MS);
      }
      return;
    }
    if (total != null && total >= LOCK_THRESHOLD) {
      if (currentRateRef.current === SLOW_INTERVAL_MS) return;
      const timer = setTimeout(() => {
        rateChangeRef.current?.(SLOW_INTERVAL_MS);
      }, SLOW_CONFIRM_MS);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [score.total]);

  return {
    score,
    userLocation,
    heading,
    tilt,
    tiltShared,
    lockedAt,
    perfectFiredAt,
    showPerfectBanner,
  };
}
