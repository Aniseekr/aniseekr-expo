// Auto-capture watcher: arms a sustained-alignment timer that fires the
// shutter once per lock cycle. Layered on top of the alignment sensors hook
// — purely a reactor over `scoreTotal`, with the same hysteresis spirit
// (`armThreshold` to enter, `releaseThreshold` to exit). Orthogonal to the
// existing capture mode (single/burst/hdr) and stacks with the countdown.
//
// The fire gate is two-part: `scoreTotal >= armThreshold` AND `afLocked` must
// BOTH be held continuously for `sustainMs`. If autofocus unlocks mid-arming,
// that's treated like a score release — the arming timer is cancelled and the
// per-cycle fire latch is reset, so both signals must be re-acquired together.
//
// Rule 8: only real signal arms a fire. A `null` score (sensors warming up)
// never starts the timer, and we never invent "plausible" remaining-ms when
// we don't have data.
import { useCallback, useEffect, useRef, useState } from 'react';

export interface UseAutoCaptureInput {
  /** Live alignment score (0..1). Null = no signal. */
  scoreTotal: number | null;
  /** Threshold the score must meet to start arming. Default 0.95. */
  armThreshold?: number;
  /** Score below this releases the lock and resets the arming. Default 0.9. */
  releaseThreshold?: number;
  /** How long the score + afLocked must stay held to fire. Default 1500ms. */
  sustainMs?: number;
  /** True iff autofocus is currently locked. Required for arming AND firing. */
  afLocked: boolean;
  /** Globally enables/disables the hook (e.g. settings.autoCapture). */
  enabled: boolean;
  /** True iff a capture is currently in-flight — pause the watcher. */
  captureBusy: boolean;
  /** Called once per lock cycle when the countdown completes. */
  onFire: () => void;
}

export interface UseAutoCaptureOutput {
  /** True iff the score is currently above arm threshold and the countdown is in flight. */
  arming: boolean;
  /** ms remaining before fire, or null when not arming. */
  remainingMs: number | null;
  /** Cancel any pending fire (e.g. user manually pressed shutter). */
  cancel: () => void;
}

const DEFAULT_ARM_THRESHOLD = 0.95;
const DEFAULT_RELEASE_THRESHOLD = 0.9;
const DEFAULT_SUSTAIN_MS = 1500;
// 16ms ≈ 60fps; the badge ticks down smoothly without spinning the JS thread.
const TICK_MS = 16;

export function useAutoCapture(input: UseAutoCaptureInput): UseAutoCaptureOutput {
  const {
    scoreTotal,
    armThreshold = DEFAULT_ARM_THRESHOLD,
    releaseThreshold = DEFAULT_RELEASE_THRESHOLD,
    sustainMs = DEFAULT_SUSTAIN_MS,
    afLocked,
    enabled,
    captureBusy,
    onFire,
  } = input;

  const [remainingMs, setRemainingMs] = useState<number | null>(null);

  // Refs hold the live arming state so callbacks read the latest value
  // without re-running effects per tick.
  const armedAtRef = useRef<number | null>(null);
  const firedThisCycleRef = useRef<boolean>(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const onFireRef = useRef(onFire);

  // Keep onFire ref current without retriggering the watcher effect.
  useEffect(() => {
    onFireRef.current = onFire;
  }, [onFire]);

  const clearInterval_ = useCallback(() => {
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  // Cancel arming without clearing the "already fired this cycle" flag — a
  // mid-cycle cancel (user pressed shutter manually) should NOT permit an
  // immediate re-fire while still above the release threshold. The flag is
  // cleared on score release or explicit `cancel()`.
  const cancelArmingOnly = useCallback(() => {
    clearInterval_();
    armedAtRef.current = null;
    setRemainingMs(null);
  }, [clearInterval_]);

  const cancel = useCallback(() => {
    clearInterval_();
    armedAtRef.current = null;
    firedThisCycleRef.current = false;
    setRemainingMs(null);
  }, [clearInterval_]);

  useEffect(() => {
    // Globally gated off / busy / no signal: tear down anything in flight.
    if (!enabled || captureBusy) {
      cancelArmingOnly();
      return;
    }
    if (scoreTotal == null) {
      // Treat "no signal" like a release: forget we ever armed.
      cancel();
      return;
    }

    // Autofocus is part of the fire gate: arming AND firing both require a
    // locked AF. Losing the lock mid-arming is a hard release — reset the
    // per-cycle latch so a re-lock has to hold both signals from scratch.
    if (!afLocked) {
      if (armedAtRef.current !== null || firedThisCycleRef.current) {
        cancel();
      }
      return;
    }

    // Score released — reset the per-cycle fire latch so the NEXT re-lock can
    // fire again. Releasing also tears down any in-flight timer.
    if (scoreTotal < releaseThreshold) {
      if (armedAtRef.current !== null || firedThisCycleRef.current) {
        cancel();
      }
      return;
    }

    // Score in the dead-band (>= release, < arm): keep current arming state
    // as-is. Don't start arming, don't clear it.
    if (scoreTotal < armThreshold) {
      return;
    }

    // Score >= armThreshold AND afLocked from here. Start arming only when we
    // aren't already arming and haven't already fired during this continuous
    // above-release + AF-locked session.
    if (armedAtRef.current !== null || firedThisCycleRef.current) {
      return;
    }

    const startedAt = Date.now();
    armedAtRef.current = startedAt;
    setRemainingMs(sustainMs);

    intervalRef.current = setInterval(() => {
      const start = armedAtRef.current;
      if (start === null) return;
      const remaining = sustainMs - (Date.now() - start);
      if (remaining <= 0) {
        // Fire once per cycle. Tear down the interval first so the callback
        // can't be re-entered if it's slow.
        clearInterval_();
        armedAtRef.current = null;
        firedThisCycleRef.current = true;
        setRemainingMs(null);
        onFireRef.current();
        return;
      }
      setRemainingMs(remaining);
    }, TICK_MS);

    return clearInterval_;
  }, [
    scoreTotal,
    armThreshold,
    releaseThreshold,
    sustainMs,
    afLocked,
    enabled,
    captureBusy,
    cancel,
    cancelArmingOnly,
    clearInterval_,
  ]);

  // Final cleanup on unmount.
  useEffect(() => {
    return () => {
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, []);

  return {
    arming: remainingMs !== null,
    remainingMs,
    cancel,
  };
}
