import { useCallback, useEffect, useRef, useState } from 'react';
import { hapticsBridge } from '../modules/haptics/hapticsBridge';

export interface UseCaptureCountdownOutput {
  /** Seconds remaining; null when not running. */
  remaining: number | null;
  /** True iff countdown is currently running. */
  isRunning: boolean;
  /**
   * Start a countdown for `seconds`. Resolves with `true` if it completed
   * naturally (caller should fire the capture now), `false` if cancelled.
   * If already running, the existing promise is cancelled and a new one starts.
   */
  start: (seconds: number) => Promise<boolean>;
  /** Cancel an active countdown. The pending promise resolves false. */
  cancel: () => void;
}

export function useCaptureCountdown(): UseCaptureCountdownOutput {
  const [remaining, setRemaining] = useState<number | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const resolverRef = useRef<((completed: boolean) => void) | null>(null);

  const clearTimer = useCallback(() => {
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const resolvePending = useCallback((completed: boolean) => {
    const resolver = resolverRef.current;
    resolverRef.current = null;
    resolver?.(completed);
  }, []);

  const cancel = useCallback(() => {
    clearTimer();
    resolvePending(false);
    setRemaining(null);
  }, [clearTimer, resolvePending]);

  const start = useCallback(
    (seconds: number): Promise<boolean> => {
      // Cancel any in-flight countdown first so only one runs at a time.
      clearTimer();
      resolvePending(false);

      if (seconds <= 0) {
        setRemaining(null);
        return Promise.resolve(true);
      }

      return new Promise<boolean>((resolve) => {
        resolverRef.current = resolve;
        setRemaining(seconds);
        // Initial tick haptic for the first second display.
        hapticsBridge.tap();

        intervalRef.current = setInterval(() => {
          setRemaining((prev) => {
            if (prev === null) return prev;
            const next = prev - 1;
            if (next <= 0) {
              clearTimer();
              hapticsBridge.success();
              resolvePending(true);
              return null;
            }
            hapticsBridge.tap();
            return next;
          });
        }, 1000);
      });
    },
    [clearTimer, resolvePending]
  );

  useEffect(() => {
    return () => {
      clearTimer();
      resolvePending(false);
    };
  }, [clearTimer, resolvePending]);

  return {
    remaining,
    isRunning: remaining !== null,
    start,
    cancel,
  };
}
