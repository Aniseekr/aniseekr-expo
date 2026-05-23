// Local index of pilgrimage spots the user has photographed.
// Persists in MMKV so SpotSheet / map markers can show a "shot taken"
// indicator without us re-scanning the camera roll.
//
// The parsed index is memoised against the raw MMKV string: repeated
// listCaptures / getCapture calls reuse the parsed object instead of
// re-running JSON.parse, and the cache self-invalidates whenever the stored
// string changes.

import { kvGet, kvSet } from '../storage/app-storage';
import { CAPTURES_STORAGE_KEY } from '../storage/keys';

export { CAPTURES_STORAGE_KEY };

export interface SensorSnapshot {
  /** meters to target spot at shutter time; null if location unavailable */
  distanceMeters: number | null;
  /** signed degrees: targetBearing − heading, wrapped to [-180, 180]; null if either sensor unavailable */
  headingDeltaDeg: number | null;
  /** signed degrees from level (pitch beta); null if motion unavailable */
  tilt: number | null;
  /**
   * 0..1 frame-match score (image vs anime reference). Optional — older
   * captures stored before this field was added will be missing it; the UI
   * must treat undefined and null identically.
   */
  frameMatch?: number | null;
  /** false → frame-match validity gate tripped (lens covered, flat, etc.). */
  frameValid?: boolean | null;
  /** Why the validity gate tripped; null/undefined when valid. */
  frameReason?: 'dark' | 'lowDetail' | 'lowContrast' | 'analysisFailed' | null;
}

export interface CaptureGeoLocation {
  latitude: number;
  longitude: number;
}

export interface PilgrimageCapture {
  spotId: string;
  /** local file URI saved by the camera engine or via FileSystem cache. */
  uri: string;
  /** comparison composite URI (left+right or top+bottom). Optional. */
  compositeUri?: string;
  /** epoch ms */
  capturedAt: number;
  /** legacy raw heading at shutter; kept for backwards-compat */
  heading?: number;
  /** new: alignment sensor snapshot taken at shutter time */
  sensorSnapshot?: SensorSnapshot;
  /** User GPS at capture/import time. Distinct from the anime spot's own geo. */
  userLocation?: CaptureGeoLocation;
  /** User-entered album description. */
  note?: string;
  /** Whether the image came from the live camera or the user's photo library. */
  source?: 'camera' | 'auto' | 'library';
  /** Bangumi subject id for album hydration when the anime is not preloaded. */
  animeId?: number;
  animeTitle?: string;
  animeTitleCn?: string;
  animeCover?: string;
  animeColor?: string;
  animeCity?: string;
  spotName?: string;
  spotNameCn?: string;
  spotImage?: string;
  spotEp?: number;
  spotSecond?: number;
  spotGeo?: [number, number];
}

interface Index {
  /** spotId -> latest capture. We only surface "has any capture" + most recent. */
  spots: Record<string, PilgrimageCapture>;
}

let cache: { raw: string | null; index: Index } | null = null;

function parseIndex(raw: string | null): Index {
  if (!raw) return { spots: {} };
  try {
    const parsed = JSON.parse(raw) as Partial<Index>;
    if (parsed && typeof parsed === 'object' && parsed.spots) {
      return { spots: parsed.spots };
    }
  } catch {
    // fall through to empty
  }
  return { spots: {} };
}

function loadSync(): Index {
  const raw = kvGet(CAPTURES_STORAGE_KEY);
  if (cache && cache.raw === raw) return cache.index;
  const index = parseIndex(raw);
  cache = { raw, index };
  return index;
}

function persist(idx: Index): void {
  try {
    const raw = JSON.stringify(idx);
    kvSet(CAPTURES_STORAGE_KEY, raw);
    cache = { raw, index: idx };
  } catch {
    // best-effort; ignore
  }
}

/** Synchronous read of every recorded capture — safe for first-frame seeding. */
export function loadCapturesSync(): Record<string, PilgrimageCapture> {
  return loadSync().spots;
}

export async function recordCapture(capture: PilgrimageCapture): Promise<void> {
  const idx = loadSync();
  const next: Index = { spots: { ...idx.spots, [capture.spotId]: capture } };
  persist(next);
}

export async function listCaptures(): Promise<Record<string, PilgrimageCapture>> {
  return loadSync().spots;
}

export async function getCapture(spotId: string): Promise<PilgrimageCapture | null> {
  return loadSync().spots[spotId] ?? null;
}

export async function clearCapture(spotId: string): Promise<void> {
  const idx = loadSync();
  if (!idx.spots[spotId]) return;
  const nextSpots = { ...idx.spots };
  delete nextSpots[spotId];
  persist({ spots: nextSpots });
}

/** Test-only — drop the memoised index. */
export function __resetCapturesCacheForTests(): void {
  cache = null;
}
