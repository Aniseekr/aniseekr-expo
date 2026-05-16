// Pseudo-HDR capture hook for the pilgrimage compare screen.
//
// Captures 3 frames in rapid succession via `CameraView.takePictureAsync`,
// then hands them to `compositeHdr` which tonemaps each frame at EV ≈
// {-1, 0, +1} and composites them via Skia Plus-blend weighted average.
//
// Rule 8: this is not true HDR (no hardware bracketing — see composite-hdr.ts
// header). We never composite a partial stack. If fewer than 3 frames succeed,
// we return one real captured frame and mark the result as non-HDR.
//
// EXIF is sourced from the FIRST frame only, then re-embedded into the final
// composite (or the mid-frame fallback) after Skia re-encodes the bytes.

import { useCallback, useRef, useState } from 'react';
import type { RefObject } from 'react';
import type { CameraView } from 'expo-camera';
import type { LatLng } from '../libs/services/pilgrimage/location-service';
import { buildAdditionalExif } from '../libs/services/pilgrimage/build-exif-metadata';
import { mergeCaptureExif } from '../libs/services/pilgrimage/camera-capture';
import { compositeHdr } from '../libs/services/pilgrimage/composite-hdr';
import {
  choosePseudoHdrFallbackFrame,
  type PseudoHdrFrame,
} from '../libs/services/pilgrimage/pseudo-hdr';
import { hapticsBridge } from '../modules/haptics/hapticsBridge';

export interface PseudoHdrSensorSnapshot {
  userLocation: LatLng | null;
  heading: number | null;
  tilt: number | null;
}

export interface PseudoHdrMetadata {
  spotId: string;
  spotName: string;
  animeId?: string;
  animeTitle?: string;
  episode?: string;
}

export interface UsePseudoHdrInput {
  cameraRef: RefObject<CameraView | null>;
  getSensorSnapshot: () => PseudoHdrSensorSnapshot;
  metadata: PseudoHdrMetadata;
  quality: number; // 0..1
  /** When true, suppress shutter click on each of the 3 captures. */
  silent?: boolean;
  /**
   * Forwards expo-camera's `skipProcessing` flag to each of the 3 captures.
   * Faster capture at the cost of orientation fix-ups; defaults to false.
   */
  skipProcessing?: boolean;
  evStops?: [number, number, number]; // default [-1, 0, 1]
  frameDelayMs?: number; // default 200ms between captures
}

export interface PseudoHdrResult {
  uri: string;
  width: number;
  height: number;
  wasHdr: boolean; // true if compositing succeeded; false if fell back to mid frame
}

export interface UsePseudoHdrOutput {
  capturing: boolean;
  captured: number; // 0..3
  run: () => Promise<PseudoHdrResult | null>;
}

const DEFAULT_EV_STOPS: [number, number, number] = [-1, 0, 1];
const DEFAULT_FRAME_DELAY_MS = 200;
const FRAME_COUNT = 3;
const MID_INDEX = 1;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export function usePseudoHDR(input: UsePseudoHdrInput): UsePseudoHdrOutput {
  const {
    cameraRef,
    getSensorSnapshot,
    metadata,
    quality,
    silent = false,
    skipProcessing = false,
    evStops = DEFAULT_EV_STOPS,
    frameDelayMs = DEFAULT_FRAME_DELAY_MS,
  } = input;

  const [capturing, setCapturing] = useState(false);
  const [captured, setCaptured] = useState(0);

  // Mirror inputs into refs so `run` is stable and we never close over stale
  // values when the caller re-renders between captures.
  const cameraRefRef = useRef(cameraRef);
  cameraRefRef.current = cameraRef;
  const getSnapshotRef = useRef(getSensorSnapshot);
  getSnapshotRef.current = getSensorSnapshot;
  const metadataRef = useRef(metadata);
  metadataRef.current = metadata;
  const qualityRef = useRef(quality);
  qualityRef.current = quality;
  const silentRef = useRef(silent);
  silentRef.current = silent;
  const skipProcessingRef = useRef(skipProcessing);
  skipProcessingRef.current = skipProcessing;
  const evStopsRef = useRef(evStops);
  evStopsRef.current = evStops;
  const frameDelayMsRef = useRef(frameDelayMs);
  frameDelayMsRef.current = frameDelayMs;

  const run = useCallback(async (): Promise<PseudoHdrResult | null> => {
    setCapturing(true);
    setCaptured(0);

    const frames: PseudoHdrFrame[] = [];
    let compositeExif: Record<string, unknown> | null = null;

    try {
      for (let i = 0; i < FRAME_COUNT; i++) {
        const camera = cameraRefRef.current.current;
        if (!camera) {
          break;
        }

        try {
          // EXIF only on the first successful frame — compositing re-encodes
          // and drops it. If frame 0 fails but frame 1 succeeds, we still stamp
          // that real fallback capture instead of failing the whole flow.
          const shouldCaptureExif = compositeExif === null;
          let additionalExif: Record<string, unknown> | undefined;
          if (shouldCaptureExif) {
            const snapshot = getSnapshotRef.current();
            const meta = metadataRef.current;
            additionalExif = buildAdditionalExif({
              spotId: meta.spotId,
              spotName: meta.spotName,
              animeId: meta.animeId,
              animeTitle: meta.animeTitle,
              episode: meta.episode,
              userLocation: snapshot.userLocation,
              heading: snapshot.heading,
              tilt: snapshot.tilt,
            });
          }

          const photo = await camera.takePictureAsync({
            quality: qualityRef.current,
            exif: shouldCaptureExif,
            ...(additionalExif ? { additionalExif } : {}),
            shutterSound: !silentRef.current,
            skipProcessing: skipProcessingRef.current,
          });
          if (!photo?.uri) continue;
          if (shouldCaptureExif) {
            compositeExif = mergeCaptureExif(photo.exif, additionalExif);
          }

          frames.push({ uri: photo.uri, width: photo.width || 0, height: photo.height || 0 });
          setCaptured(frames.length);
        } catch (frameError) {
          console.warn('[usePseudoHDR] frame failed', frameError);
        }

        if (i < FRAME_COUNT - 1) {
          await delay(frameDelayMsRef.current);
        }
      }

      if (frames.length !== FRAME_COUNT) {
        const fallback = choosePseudoHdrFallbackFrame(frames);
        if (!fallback) return null;
        return {
          uri: fallback.uri,
          width: fallback.width,
          height: fallback.height,
          wasHdr: false,
        };
      }

      const frameUris: [string, string, string] = [frames[0].uri, frames[1].uri, frames[2].uri];
      if (!frameUris[0] || !frameUris[1] || !frameUris[2]) {
        return null;
      }
      const composite = await compositeHdr({
        frameUris,
        evStops: evStopsRef.current,
        quality: qualityRef.current,
        exif: compositeExif,
      });

      // If compositeHdr fell back to the mid frame, its URI will match the
      // input we passed at index MID_INDEX. Surface that distinction so
      // callers can render an honest "single-shot fallback" state.
      const wasHdr = composite.uri !== frameUris[MID_INDEX];
      if (wasHdr) hapticsBridge.success();

      return {
        uri: composite.uri,
        width: composite.width,
        height: composite.height,
        wasHdr,
      };
    } catch (error) {
      // Rule 8: an incomplete HDR is dishonest. Surface the failure as null.
      console.warn('[usePseudoHDR] capture aborted', error);
      return null;
    } finally {
      setCapturing(false);
    }
  }, []);

  return {
    capturing,
    captured,
    run,
  };
}
