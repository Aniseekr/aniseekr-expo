// Capture session store — a module-level singleton that accumulates the shots
// the user takes on the pilgrimage compare camera screen during a single
// visit. It survives navigation between the camera and preview screens (the
// camera screen stays mounted under the pushed preview), so a multi-shot album
// can read every shot from one place.
//
// Plain JS, no React: exposes a subscribe/getSnapshot pair for
// `useSyncExternalStore` (see `hooks/useCaptureSession.ts`).
//
// Rule 8: this store holds ONLY the real shot records the camera screen pushes
// in. Sensor/location fields are whatever the camera/import flow captured
// (real value or `null`) — the store never invents them. If nothing is
// captured, the snapshot is empty.

export interface CaptureGeoLocation {
  latitude: number;
  longitude: number;
}

export type CaptureSessionSource = 'manual' | 'auto' | 'library';

export interface CaptureSessionShot {
  /** Unique id, e.g. `${createdAt}-${Math.random()}`. */
  id: string;
  /** The brightness-baked photo file uri. */
  uri: string;
  width: number;
  height: number;
  captureMode: 'single' | 'burst' | 'hdr';
  /** How the shot was captured — shutter, auto-capture, or photo library import. */
  source: CaptureSessionSource;
  /** Date.now() at capture time. */
  createdAt: number;
  /** Capture-time sensor snapshots — real values or `null` (never invented). */
  heading: number | null;
  distanceMeters: number | null;
  headingDeltaDeg: number | null;
  tilt: number | null;
  /** User GPS at capture/import time — real coordinates or `null`. */
  userLocation: CaptureGeoLocation | null;
  /** Optional user-entered album description. */
  note?: string;
  /** Optional burst metadata, present only for burst captures. */
  burstTotal?: number;
  burstUris?: string[];
  burstBestIndex?: number;
}

export interface LibraryCaptureAsset {
  uri: string;
  width?: number | null;
  height?: number | null;
}

export interface BuildLibraryCaptureSessionShotInput {
  asset: LibraryCaptureAsset;
  createdAt: number;
  userLocation: CaptureGeoLocation | null;
  heading: number | null;
  distanceMeters: number | null;
  headingDeltaDeg: number | null;
  tilt: number | null;
  note?: string | null;
}

export const CAPTURE_NOTE_MAX_LENGTH = 280;

function finiteOrNull(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function finiteDimension(value: number | null | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0;
}

function normalizeLocation(location: CaptureGeoLocation | null): CaptureGeoLocation | null {
  if (!location) return null;
  if (!Number.isFinite(location.latitude) || !Number.isFinite(location.longitude)) return null;
  return {
    latitude: location.latitude,
    longitude: location.longitude,
  };
}

export function sanitizeCaptureNote(note: string | null | undefined): string | undefined {
  const cleaned = String(note ?? '')
    .trim()
    .replace(/\s+/g, ' ');
  if (!cleaned) return undefined;
  return cleaned.slice(0, CAPTURE_NOTE_MAX_LENGTH);
}

export function buildLibraryCaptureSessionShot({
  asset,
  createdAt,
  userLocation,
  heading,
  distanceMeters,
  headingDeltaDeg,
  tilt,
  note,
}: BuildLibraryCaptureSessionShotInput): CaptureSessionShot {
  const sanitizedNote = sanitizeCaptureNote(note);
  return {
    id: `library:${createdAt}:${asset.uri}`,
    uri: asset.uri,
    width: finiteDimension(asset.width),
    height: finiteDimension(asset.height),
    captureMode: 'single',
    source: 'library',
    createdAt,
    heading: finiteOrNull(heading),
    distanceMeters: finiteOrNull(distanceMeters),
    headingDeltaDeg: finiteOrNull(headingDeltaDeg),
    tilt: finiteOrNull(tilt),
    userLocation: normalizeLocation(userLocation),
    ...(sanitizedNote ? { note: sanitizedNote } : {}),
  };
}

type Listener = () => void;

// `shots` is newest-first. The reference is kept STABLE between mutations so
// `useSyncExternalStore` does not see a fresh snapshot every render and loop.
let shots: CaptureSessionShot[] = [];
const listeners = new Set<Listener>();

function emit(): void {
  for (const listener of listeners) listener();
}

/** Push a freshly captured shot to the head of the session (newest-first). */
export function addShot(shot: CaptureSessionShot): void {
  shots = [shot, ...shots];
  emit();
}

/** Remove a shot by id. No-op (and no emit) when the id isn't present. */
export function removeShot(id: string): void {
  const next = shots.filter((shot) => shot.id !== id);
  if (next.length === shots.length) return;
  shots = next;
  emit();
}

/** Drop every shot. No-op (and no emit) when the session is already empty. */
export function clearSession(): void {
  if (shots.length === 0) return;
  shots = [];
  emit();
}

/** Current snapshot — a stable reference until the next mutation. */
export function getShots(): readonly CaptureSessionShot[] {
  return shots;
}

/** Subscribe to store changes. Returns an unsubscribe function. */
export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
