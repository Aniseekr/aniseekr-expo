// Real exposure-bracket capture hook for the pilgrimage camera.
//
// This is the replacement for the old `usePseudoHDR`, which claimed to do HDR
// but never moved the exposure bias — it just took 3 identical frames and ran
// them through a Skia ColorMatrix. This hook takes 3 honest frames at
// different EV biases (default [-2, 0, +2], clamped against the device's
// reported `minExposureBias..maxExposureBias`) and hands them to `compositeHdr`
// in EV-ascending order.
//
// Rule 8: if fewer than 3 frames succeed we do NOT composite — we return the
// real frame whose EV is closest to 0 and flag `wasHdr: false` so the screen
// can record the shot honestly as a single-shot, not HDR.
//
// Rule 9: the hook mirrors inputs into refs so the public `run()` callback
// identity stays stable across renders. Exposure is written through the live
// SharedValue, never via React state — keeping the JS thread out of the AE
// settle path.

import { useCallback, useRef, useState } from 'react';
import type { SharedValue } from 'react-native-reanimated';
import type { CameraEngineRef } from '../components/pilgrimage/camera/camera-engine';
import {
  BRACKET_EV_STOPS,
  clampBracketEvStops,
} from '../libs/services/pilgrimage/camera-settings';
import { compositeHdr } from '../libs/services/pilgrimage/composite-hdr';
import { hapticsBridge } from '../modules/haptics/hapticsBridge';

export interface UseExposureBracketInput {
  engineRef: CameraEngineRef;
  /** Drives VisionCamera's exposure bias prop on the live preview. */
  exposureShared: SharedValue<number>;
  /** Device's clamping range for EV bias. Pass min/max from CameraDeviceInfo. */
  evBiasRange: { min: number; max: number };
  /** EV to restore to after the bracket finishes (typically the HUD slider value). */
  restoreEv: number;
  /** Skia JPEG quality (0..1) for the composite. */
  quality: number;
  silent?: boolean;
  flashMode?: 'on' | 'off' | 'auto';
  /** Defaults to [-2, 0, +2]. */
  evStops?: [number, number, number];
}

export interface ExposureBracketResult {
  uri: string;
  width: number;
  height: number;
  /** True if all 3 frames captured AND composite returned a different file than the mid frame. */
  wasHdr: boolean;
  /** Lens family the bracket was captured on. All 3 frames come from the
   *  same active session so a single tag covers the set. `undefined` for
   *  legacy / iOS captures. */
  lensType?: 'ultra-wide-angle' | 'wide-angle' | 'telephoto';
}

export interface UseExposureBracketOutput {
  capturing: boolean;
  captured: number;
  run: () => Promise<ExposureBracketResult | null>;
}

interface BracketFrame {
  uri: string;
  width: number;
  height: number;
  /** The (clamped) EV bias that was applied when this frame was captured. */
  ev: number;
  lensType?: 'ultra-wide-angle' | 'wide-angle' | 'telephoto';
}

const FRAME_COUNT = 3;

function clampToRange(value: number, min: number, max: number): number {
  const lo = Math.min(min, max);
  const hi = Math.max(min, max);
  return Math.max(lo, Math.min(hi, value));
}

/** Pick the frame whose EV is closest to 0. Ties → the first occurrence. */
function pickMidExposed(frames: readonly BracketFrame[]): BracketFrame | null {
  if (frames.length === 0) return null;
  let best = frames[0];
  let bestAbs = Math.abs(frames[0].ev);
  for (let i = 1; i < frames.length; i++) {
    const a = Math.abs(frames[i].ev);
    if (a < bestAbs) {
      best = frames[i];
      bestAbs = a;
    }
  }
  return best;
}

// Wait one display frame so the autoexposure has a chance to settle to the new
// bias before we trigger the shutter. We can't rely on the OS to gate the
// shutter on AE convergence — but a single rAF (~16-33ms on a 30/60Hz
// preview) is dramatically faster than the 200ms setTimeout the old pseudo-HDR
// hook used, keeps us inside the 800ms latency budget, and lets the platform
// drive the cadence rather than a magic number.
function waitForExposureFrame(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => resolve());
  });
}

export function useExposureBracket(input: UseExposureBracketInput): UseExposureBracketOutput {
  const {
    engineRef,
    exposureShared,
    evBiasRange,
    restoreEv,
    quality,
    silent = false,
    flashMode = 'off',
    evStops = BRACKET_EV_STOPS as unknown as [number, number, number],
  } = input;

  const [capturing, setCapturing] = useState(false);
  const [captured, setCaptured] = useState(0);

  const engineRefRef = useRef(engineRef);
  engineRefRef.current = engineRef;
  const exposureSharedRef = useRef(exposureShared);
  exposureSharedRef.current = exposureShared;
  const evBiasRangeRef = useRef(evBiasRange);
  evBiasRangeRef.current = evBiasRange;
  const restoreEvRef = useRef(restoreEv);
  restoreEvRef.current = restoreEv;
  const qualityRef = useRef(quality);
  qualityRef.current = quality;
  const silentRef = useRef(silent);
  silentRef.current = silent;
  const flashRef = useRef(flashMode);
  flashRef.current = flashMode;
  const evStopsRef = useRef(evStops);
  evStopsRef.current = evStops;

  const run = useCallback(async (): Promise<ExposureBracketResult | null> => {
    setCapturing(true);
    setCaptured(0);

    const { min, max } = evBiasRangeRef.current;
    const clamped = clampBracketEvStops(evStopsRef.current, min, max);
    const restoreTarget = clampToRange(restoreEvRef.current, min, max);

    const frames: BracketFrame[] = [];

    try {
      for (let i = 0; i < FRAME_COUNT; i++) {
        const engine = engineRefRef.current.current;
        if (!engine) break;

        // Drive the EV bias through the SharedValue so VisionCamera picks it
        // up on the UI thread; then yield a frame so the AE has a moment to
        // settle before the shutter fires.
        exposureSharedRef.current.value = clamped[i];
        await waitForExposureFrame();

        try {
          const photo = await engine.takePhoto({
            flashMode: flashRef.current,
            enableShutterSound: !silentRef.current,
          });
          if (!photo?.uri) continue;
          frames.push({
            uri: photo.uri,
            width: photo.width || 0,
            height: photo.height || 0,
            ev: clamped[i],
            lensType: photo.lensType,
          });
          setCaptured(frames.length);
        } catch (frameError) {
          // Drop the failed frame — never fabricate a URI.
          console.warn('[useExposureBracket] frame failed', frameError);
        }
      }

      if (frames.length < FRAME_COUNT) {
        // Rule 8: don't pretend a partial stack is HDR. Return the most
        // mid-exposed real frame as a plain single-shot.
        const fallback = pickMidExposed(frames);
        if (!fallback) return null;
        return {
          uri: fallback.uri,
          width: fallback.width,
          height: fallback.height,
          wasHdr: false,
          lensType: fallback.lensType,
        };
      }

      // Defensive: sort EV-ascending. If the middle shot in a 3-stop run failed
      // and a retry ever fills it back in, this is what keeps `compositeHdr`
      // honest about which frame is which exposure.
      const sorted = [...frames].sort((a, b) => a.ev - b.ev);
      const frameUris: [string, string, string] = [
        sorted[0].uri,
        sorted[1].uri,
        sorted[2].uri,
      ];
      const evTuple: [number, number, number] = [sorted[0].ev, sorted[1].ev, sorted[2].ev];

      const composite = await compositeHdr({
        frameUris,
        evStops: evTuple,
        quality: qualityRef.current,
        exif: null,
      });

      // If compositeHdr fell back to the mid frame its URI matches the mid
      // input — surface that distinction so the screen can record a single-shot
      // rather than claim HDR.
      const wasHdr = composite.uri !== frameUris[1];
      if (wasHdr) hapticsBridge.success();

      return {
        uri: composite.uri,
        width: composite.width,
        height: composite.height,
        wasHdr,
        lensType: sorted[0].lensType,
      };
    } catch (error) {
      console.warn('[useExposureBracket] capture aborted', error);
      return null;
    } finally {
      // Always hand the slider back to the user. Done after the try/catch so
      // even a thrown composite error doesn't leave the preview stuck at +2 EV.
      try {
        exposureSharedRef.current.value = restoreTarget;
      } catch {
        // SharedValue assignment shouldn't throw, but the camera tear-down can
        // race the cleanup. Swallow rather than poison the result.
      }
      setCapturing(false);
    }
  }, []);

  return {
    capturing,
    captured,
    run,
  };
}
