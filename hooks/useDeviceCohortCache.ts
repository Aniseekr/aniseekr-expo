// Wraps `device-cohort-cache` with a React hook that hydrates from MMKV
// on mount and exposes a writer that persists the latest classification.
//
// Why a hook: enumeration on Android is slow enough (~150–500ms cold) that
// a fresh classify-on-every-launch pipeline would show a conservative
// `[1]` dial before reconciling. The hook lets the camera screen render
// the cached cohort on frame 1 (no flash) and silently revalidate.
//
// Per CLAUDE.md Rule 10: cache hit on frame 1 must show real chrome, not
// a skeleton. This hook resolves to a `fromCache` flag the dial can use
// to decide whether to fade in detents or jump-in.

import { useCallback, useEffect, useRef, useState } from 'react';
import Application from 'expo-application';
import {
  cohortCacheKey,
  readCohortSnapshot,
  writeCohortSnapshot,
  type CohortFacing,
  type CohortSnapshot,
} from '../libs/services/pilgrimage/device-cohort-cache';

export interface UseDeviceCohortCacheResult {
  /** The most recent snapshot for this identity, or null if cache miss /
   *  still hydrating. */
  readonly snapshot: CohortSnapshot | null;
  /** True while the MMKV read is in flight. UI should keep the dial in
   *  a quiet "preparing" state during this brief window. */
  readonly hydrating: boolean;
  /** Persist the given snapshot. Fire-and-forget — failures are logged. */
  readonly save: (snapshot: CohortSnapshot) => void;
}

/**
 * `identity` is the device fingerprint: manufacturer + modelID + facing.
 * When the camera screen first enumerates devices, it passes those values
 * here. On subsequent launches we return the cached snapshot before the
 * fresh classification completes.
 */
export function useDeviceCohortCache(args: {
  manufacturer: string;
  modelID: string;
  facing: CohortFacing;
}): UseDeviceCohortCacheResult {
  const [snapshot, setSnapshot] = useState<CohortSnapshot | null>(null);
  const [hydrating, setHydrating] = useState(true);
  const identityKey = cohortCacheKey(args);
  const lastSavedKey = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setHydrating(true);
    readCohortSnapshot(args, {
      buildNumber: Application.nativeBuildVersion ?? '0',
    })
      .then((read) => {
        if (cancelled) return;
        setSnapshot(read);
        setHydrating(false);
      })
      .catch(() => {
        if (cancelled) return;
        setHydrating(false);
      });
    return () => {
      cancelled = true;
    };
    // identityKey is the canonical serialization of `args`; depending on
    // `args` directly would re-fire this effect on every render because
    // callers typically construct a fresh object literal per render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [identityKey]);

  const save = useCallback(
    (next: CohortSnapshot) => {
      if (lastSavedKey.current === serializeSnapshot(next)) return;
      lastSavedKey.current = serializeSnapshot(next);
      void writeCohortSnapshot(next);
      setSnapshot(next);
    },
    []
  );

  return { snapshot, hydrating, save };
}

function serializeSnapshot(snapshot: CohortSnapshot): string {
  return [
    snapshot.strategy,
    snapshot.primaryDeviceId,
    snapshot.ultraWideDeviceId ?? '',
    snapshot.telephotoDeviceId ?? '',
    snapshot.buildNumber,
  ].join('|');
}
