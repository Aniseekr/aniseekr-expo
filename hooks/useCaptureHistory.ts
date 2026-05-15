// Session-only capture history. Tracks the last N URIs the user has captured
// on the pilgrimage compare screen so they can re-open recent shots from the
// shutter rail without bouncing through the photo library.
//
// Rule 8: this hook stores REAL URIs the caller passes in — it never invents
// thumbnails or extrapolates. If the caller never pushes, `history` stays
// empty and the strip renders nothing.
//
// Storage is intentionally in-memory: the strip is meant to surface "what did
// I just shoot this session?" and should not persist across app launches or
// across spots. Use the Photos library / saved spot results for persistence.

import { useCallback, useState } from 'react';

const DEFAULT_HISTORY_LIMIT = 6;

export interface UseCaptureHistoryOutput {
  /** URIs of recently captured photos, newest first. Capped at DEFAULT_HISTORY_LIMIT. */
  history: string[];
  /** Push a freshly captured URI to the head of the list. Drops duplicates. */
  push: (uri: string) => void;
  /** Clear the entire history (e.g. when leaving the screen). */
  clear: () => void;
}

export function useCaptureHistory(limit: number = DEFAULT_HISTORY_LIMIT): UseCaptureHistoryOutput {
  const [history, setHistory] = useState<string[]>([]);

  const push = useCallback(
    (uri: string) => {
      if (!uri) return;
      setHistory((prev) => {
        // Dedup: if the URI is already in the list, hoist it to the front
        // rather than producing two identical entries.
        const filtered = prev.filter((existing) => existing !== uri);
        const next = [uri, ...filtered];
        return next.length > limit ? next.slice(0, limit) : next;
      });
    },
    [limit]
  );

  const clear = useCallback(() => {
    setHistory([]);
  }, []);

  return { history, push, clear };
}
