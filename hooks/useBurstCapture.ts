// Burst capture hook for the pilgrimage compare screen.
//
// Long-press the shutter to fire N rapid captures. Each frame is:
//   1. tagged with the live alignment score at the moment of capture
//   2. EXIF-stamped with spot/anime + live GPS/heading/tilt — done by the
//      orchestrator after this hook returns (VisionCamera has no
//      additionalExif option, so EXIF embedding lives in a single
//      post-capture step now, not inside takePicture).
//
// The hook returns the URI list and per-frame scores; bestIndex is the
// argmax of the finite scores. Picking the best frame is the orchestrator's
// job — this hook never throws and never fabricates data: failed frames are
// dropped, and the result is null only when zero frames were captured.
//
// Rule 8: we never synthesize a score or a URI. If a frame's score was null
// at the time of capture, we store NaN (sentinel) and skip it during argmax.

import { useCallback, useRef, useState } from 'react';
import type { CameraEngineRef } from '../components/pilgrimage/camera/camera-engine';
import type { LatLng } from '../libs/services/pilgrimage/location-service';
import { hapticsBridge } from '../modules/haptics/hapticsBridge';

export interface BurstCaptureResult {
  uris: string[];
  widths: number[];
  heights: number[];
  scores: number[];
  bestIndex: number;
  total: number;
}

export interface BurstCaptureSensorSnapshot {
  userLocation: LatLng | null;
  heading: number | null;
  tilt: number | null;
  scoreTotal: number | null;
}

export interface UseBurstCaptureInput {
  engineRef: CameraEngineRef;
  getSensorSnapshot: () => BurstCaptureSensorSnapshot;
  /** When true, suppress the native shutter click on each frame. */
  silent?: boolean;
  /** Capture flash mode forwarded to engine.takePhoto. Defaults to 'off'. */
  flashMode?: 'on' | 'off' | 'auto';
  frameCount?: number;
  intervalMs?: number;
}

export interface UseBurstCaptureOutput {
  /** Capture-in-progress flag. Disable other shutter actions while true. */
  capturing: boolean;
  /** How many frames have been captured so far (0..frameCount). */
  captured: number;
  /** Total frames the burst will produce. */
  total: number;
  /** Run the burst end-to-end. Resolves with results or null on error. */
  run: () => Promise<BurstCaptureResult | null>;
}

const DEFAULT_FRAME_COUNT = 6;
const DEFAULT_INTERVAL_MS = 150;

interface RawBurstFrame {
  uri: string;
  width: number;
  height: number;
  score: number;
}

function computeBestIndex(scores: number[]): number {
  if (scores.length === 0) return 0;
  let bestIdx = 0;
  let bestVal = -Infinity;
  for (let i = 0; i < scores.length; i++) {
    const v = Number.isFinite(scores[i]) ? scores[i] : -Infinity;
    if (v > bestVal) {
      bestVal = v;
      bestIdx = i;
    }
  }
  return bestIdx;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export function useBurstCapture(input: UseBurstCaptureInput): UseBurstCaptureOutput {
  const {
    engineRef,
    getSensorSnapshot,
    silent = false,
    flashMode = 'off',
    frameCount = DEFAULT_FRAME_COUNT,
    intervalMs = DEFAULT_INTERVAL_MS,
  } = input;

  const [capturing, setCapturing] = useState(false);
  const [captured, setCaptured] = useState(0);

  const engineRefRef = useRef(engineRef);
  engineRefRef.current = engineRef;
  const getSnapshotRef = useRef(getSensorSnapshot);
  getSnapshotRef.current = getSensorSnapshot;
  const silentRef = useRef(silent);
  silentRef.current = silent;
  const flashRef = useRef(flashMode);
  flashRef.current = flashMode;
  const frameCountRef = useRef(frameCount);
  frameCountRef.current = frameCount;
  const intervalMsRef = useRef(intervalMs);
  intervalMsRef.current = intervalMs;

  const run = useCallback(async (): Promise<BurstCaptureResult | null> => {
    const total = frameCountRef.current;
    const interval = intervalMsRef.current;

    setCapturing(true);
    setCaptured(0);

    const rawFrames: RawBurstFrame[] = [];

    try {
      for (let i = 0; i < total; i++) {
        const engine = engineRefRef.current.current;
        if (!engine) break;

        try {
          const photo = await engine.takePhoto({
            flashMode: flashRef.current,
            enableShutterSound: !silentRef.current,
          });
          if (!photo?.uri) continue;
          const snapshot = getSnapshotRef.current();

          rawFrames.push({
            uri: photo.uri,
            width: photo.width || 0,
            height: photo.height || 0,
            score: snapshot.scoreTotal ?? NaN,
          });
          setCaptured(rawFrames.length);

          hapticsBridge.tap();
        } catch (frameError) {
          // Drop the failed frame — never push a fabricated URI.
          console.warn('[useBurstCapture] frame failed', frameError);
        }

        if (i < total - 1) {
          await delay(interval);
        }
      }
    } finally {
      setCapturing(false);
    }

    if (rawFrames.length === 0) return null;

    return {
      uris: rawFrames.map((f) => f.uri),
      widths: rawFrames.map((f) => f.width),
      heights: rawFrames.map((f) => f.height),
      scores: rawFrames.map((f) => f.score),
      bestIndex: computeBestIndex(rawFrames.map((f) => f.score)),
      total: rawFrames.length,
    };
  }, []);

  return {
    capturing,
    captured,
    total: frameCount,
    run,
  };
}
