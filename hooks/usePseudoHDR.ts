// Pseudo-HDR capture hook — the FALLBACK path when the device has no real
// hardware photo-HDR support. On a capable device the screen routes the HDR
// capture mode through a single real `takePhoto` call instead.
//
// Captures 3 frames in rapid succession via `engine.takePhoto`, then hands
// them to `compositeHdr` which tonemaps each frame at EV ≈ {-1, 0, +1} and
// composites them via Skia Plus-blend weighted average.
//
// Rule 8: this is not true HDR (no hardware bracketing — see composite-hdr.ts
// header). We never composite a partial stack. If fewer than 3 frames succeed,
// we return one real captured frame and mark the result as non-HDR.

import { useCallback, useRef, useState } from 'react';
import type { CameraEngineRef } from '../components/pilgrimage/camera/camera-engine';
import { compositeHdr } from '../libs/services/pilgrimage/composite-hdr';
import {
  choosePseudoHdrFallbackFrame,
  type PseudoHdrFrame,
} from '../libs/services/pilgrimage/pseudo-hdr';
import { hapticsBridge } from '../modules/haptics/hapticsBridge';

export interface UsePseudoHdrInput {
  engineRef: CameraEngineRef;
  /** Skia JPEG quality (0..1) for the composite. */
  quality: number;
  silent?: boolean;
  flashMode?: 'on' | 'off' | 'auto';
  evStops?: [number, number, number]; // default [-1, 0, 1]
  frameDelayMs?: number; // default 200ms between captures
}

export interface PseudoHdrResult {
  uri: string;
  width: number;
  height: number;
  /** true if compositing succeeded; false if we fell back to the mid frame. */
  wasHdr: boolean;
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
    engineRef,
    quality,
    silent = false,
    flashMode = 'off',
    evStops = DEFAULT_EV_STOPS,
    frameDelayMs = DEFAULT_FRAME_DELAY_MS,
  } = input;

  const [capturing, setCapturing] = useState(false);
  const [captured, setCaptured] = useState(0);

  const engineRefRef = useRef(engineRef);
  engineRefRef.current = engineRef;
  const qualityRef = useRef(quality);
  qualityRef.current = quality;
  const silentRef = useRef(silent);
  silentRef.current = silent;
  const flashRef = useRef(flashMode);
  flashRef.current = flashMode;
  const evStopsRef = useRef(evStops);
  evStopsRef.current = evStops;
  const frameDelayMsRef = useRef(frameDelayMs);
  frameDelayMsRef.current = frameDelayMs;

  const run = useCallback(async (): Promise<PseudoHdrResult | null> => {
    setCapturing(true);
    setCaptured(0);

    const frames: PseudoHdrFrame[] = [];

    try {
      for (let i = 0; i < FRAME_COUNT; i++) {
        const engine = engineRefRef.current.current;
        if (!engine) break;

        try {
          const photo = await engine.takePhoto({
            flashMode: flashRef.current,
            enableShutterSound: !silentRef.current,
          });
          if (!photo?.uri) continue;
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
        exif: null,
      });

      // If compositeHdr fell back to the mid frame its URI matches the mid
      // input — surface that distinction so the screen can render an honest
      // "single-shot fallback" state instead of claiming HDR.
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
