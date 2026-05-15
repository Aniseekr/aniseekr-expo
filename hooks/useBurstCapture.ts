// Burst capture hook for the pilgrimage compare screen.
//
// Long-press the shutter to fire N rapid captures. Each frame is:
//   1. tagged with the live alignment score at the moment of capture
//   2. EXIF-stamped with spot/anime + live GPS/heading/tilt via buildAdditionalExif
//   3. baked through applyBrightnessToImage so the EV slider's brightness is
//      embedded in the saved JPEG (not just a preview overlay)
//
// The hook returns the URI list and per-frame scores; bestIndex is the
// argmax of the finite scores. Picking the best frame is the orchestrator's
// job — this hook never throws and never fabricates data: failed frames are
// dropped, and the result is null only when zero frames were captured.
//
// Rule 8: we never synthesize a score or a URI. If a frame's score was null
// at the time of capture, we store NaN (sentinel) and skip it during argmax.

import { useCallback, useRef, useState } from 'react';
import type { RefObject } from 'react';
import type { CameraView } from 'expo-camera';
import type { LatLng } from '../libs/services/pilgrimage/location-service';
import { buildAdditionalExif } from '../libs/services/pilgrimage/build-exif-metadata';
import { applyBrightnessToImage } from '../libs/services/pilgrimage/apply-brightness';
import { mergeCaptureExif } from '../libs/services/pilgrimage/camera-capture';
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

export interface BurstCaptureMetadata {
  spotId: string;
  spotName: string;
  animeId?: string;
  animeTitle?: string;
  episode?: string;
}

export interface UseBurstCaptureInput {
  cameraRef: RefObject<CameraView | null>;
  getSensorSnapshot: () => BurstCaptureSensorSnapshot;
  metadata: BurstCaptureMetadata;
  colorMatrix: number[] | null | undefined;
  quality: number;
  /** When true, suppress the native shutter click (per-capture; not the same as CameraView.mute). */
  silent?: boolean;
  /**
   * Forwards expo-camera's `skipProcessing` flag — faster capture at the cost
   * of orientation fix-ups (some devices return rotated raw bytes). Defaults
   * to false so behaviour is unchanged unless the caller opts in.
   */
  skipProcessing?: boolean;
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
    cameraRef,
    getSensorSnapshot,
    metadata,
    colorMatrix,
    quality,
    silent = false,
    skipProcessing = false,
    frameCount = DEFAULT_FRAME_COUNT,
    intervalMs = DEFAULT_INTERVAL_MS,
  } = input;

  const [capturing, setCapturing] = useState(false);
  const [captured, setCaptured] = useState(0);

  // Refs mirror the input so the `run` callback is stable across renders
  // without stale-closure bugs.
  const cameraRefRef = useRef(cameraRef);
  cameraRefRef.current = cameraRef;
  const getSnapshotRef = useRef(getSensorSnapshot);
  getSnapshotRef.current = getSensorSnapshot;
  const metadataRef = useRef(metadata);
  metadataRef.current = metadata;
  const colorMatrixRef = useRef(colorMatrix);
  colorMatrixRef.current = colorMatrix;
  const qualityRef = useRef(quality);
  qualityRef.current = quality;
  const silentRef = useRef(silent);
  silentRef.current = silent;
  const skipProcessingRef = useRef(skipProcessing);
  skipProcessingRef.current = skipProcessing;
  const frameCountRef = useRef(frameCount);
  frameCountRef.current = frameCount;
  const intervalMsRef = useRef(intervalMs);
  intervalMsRef.current = intervalMs;

  const run = useCallback(async (): Promise<BurstCaptureResult | null> => {
    const total = frameCountRef.current;
    const interval = intervalMsRef.current;

    setCapturing(true);
    setCaptured(0);

    const uris: string[] = [];
    const widths: number[] = [];
    const heights: number[] = [];
    const scores: number[] = [];

    try {
      for (let i = 0; i < total; i++) {
        const camera = cameraRefRef.current.current;
        if (!camera) break;

        try {
          const snapshot = getSnapshotRef.current();
          const meta = metadataRef.current;
          const additionalExif = buildAdditionalExif({
            spotId: meta.spotId,
            spotName: meta.spotName,
            animeId: meta.animeId,
            animeTitle: meta.animeTitle,
            episode: meta.episode,
            userLocation: snapshot.userLocation,
            heading: snapshot.heading,
            tilt: snapshot.tilt,
          });

          const photo = await camera.takePictureAsync({
            quality: qualityRef.current,
            exif: true,
            additionalExif,
            shutterSound: !silentRef.current,
            skipProcessing: skipProcessingRef.current,
          });
          if (!photo?.uri) continue;

          const baked = await applyBrightnessToImage({
            inputUri: photo.uri,
            exif: mergeCaptureExif(photo.exif, additionalExif),
            colorMatrix: colorMatrixRef.current,
            quality: qualityRef.current,
          });

          uris.push(baked.uri);
          widths.push(baked.width || photo.width || 0);
          heights.push(baked.height || photo.height || 0);
          scores.push(snapshot.scoreTotal ?? NaN);
          setCaptured(uris.length);

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

    if (uris.length === 0) return null;

    return {
      uris,
      widths,
      heights,
      scores,
      bestIndex: computeBestIndex(scores),
      total: uris.length,
    };
  }, []);

  return {
    capturing,
    captured,
    total: frameCount,
    run,
  };
}
