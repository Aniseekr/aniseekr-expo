// Local index of pilgrimage spots the user has photographed.
// Persists in AsyncStorage so SpotSheet / map markers can show a "shot taken"
// indicator without us re-scanning the camera roll.

interface AsyncStorageLike {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

let AsyncStorage: AsyncStorageLike;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  AsyncStorage = require('@react-native-async-storage/async-storage').default;
} catch {
  const memory = new Map<string, string>();
  AsyncStorage = {
    async getItem(key) {
      return memory.get(key) ?? null;
    },
    async setItem(key, value) {
      memory.set(key, value);
    },
  };
}

const STORAGE_KEY = '@aniseekr/pilgrimage/captures/v1';

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

const EMPTY: Index = { spots: {} };

async function load(): Promise<Index> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY;
    const parsed = JSON.parse(raw) as Partial<Index>;
    if (parsed && typeof parsed === 'object' && parsed.spots) {
      return { spots: parsed.spots };
    }
    return EMPTY;
  } catch {
    return EMPTY;
  }
}

async function persist(idx: Index): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(idx));
  } catch {
    // best-effort; ignore
  }
}

export async function recordCapture(capture: PilgrimageCapture): Promise<void> {
  const idx = await load();
  idx.spots[capture.spotId] = capture;
  await persist(idx);
}

export async function listCaptures(): Promise<Record<string, PilgrimageCapture>> {
  const idx = await load();
  return idx.spots;
}

export async function getCapture(spotId: string): Promise<PilgrimageCapture | null> {
  const idx = await load();
  return idx.spots[spotId] ?? null;
}

export async function clearCapture(spotId: string): Promise<void> {
  const idx = await load();
  if (idx.spots[spotId]) {
    delete idx.spots[spotId];
    await persist(idx);
  }
}
