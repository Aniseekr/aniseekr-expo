// EXIF preservation strategy for Skia-re-encoded JPEGs.
//
// The old expo-camera path embedded EXIF (GPS, anime title, scene name, etc.)
// directly in the native capture call. The VisionCamera path captures the file
// first, then explicitly embeds the metadata we build in JS. When Skia
// re-encodes a JPEG for HDR/composite work, no EXIF chunk is carried across, so
// this helper splices the metadata back into the resulting file.
//
// Strategy:
//   1. Read the target JPEG bytes from disk.
//   2. Convert to a binary string (`String.fromCharCode` per byte). This is
//      what `piexif-ts` operates on. We deliberately AVOID base64/`atob`/
//      `btoa` because those paths in piexif-ts touch `window.btoa`/`Buffer`,
//      neither of which is reliable in React Native's Hermes runtime.
//   3. Translate the flat string-keyed EXIF object into piexif-ts's structured
//      `IExif` shape (0th / Exif / GPS IFDs keyed by numeric TagValues), with
//      rational coercion for GPS coords.
//   4. `piexif.dump()` produces an EXIF binary blob and `piexif.insert()`
//      splices an APP1 segment into the JPEG binary, replacing any pre-existing
//      EXIF segment.
//   5. Convert the resulting binary string back to a Uint8Array and overwrite
//      the file in place.
//
// Failure handling (Rule 8): if any step throws we re-throw to the caller,
// which logs a warning and returns the real JPEG URI WITHOUT EXIF —
// we never fabricate EXIF values or pretend the embed succeeded.

import { File } from 'expo-file-system';
import * as piexif from 'piexif-ts/dist/piexif.js';
import type { IExif, IExifElement } from 'piexif-ts';

const { TagValues } = piexif;

/** Flat (string-keyed) EXIF built by the pilgrimage camera metadata service. */
export type ExifInput = Record<string, unknown>;

/**
 * Numeric-keyed IFD bucket used while building the piexif IExif structure.
 * piexif-ts's IExifElement is `{ [k: number]: any }` and we widen with
 * `unknown` to match the values we actually have (strings, numbers, arrays).
 */
type Ifd = Record<number, unknown>;

interface IfdSet {
  zeroth: Ifd;
  exif: Ifd;
  gps: Ifd;
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

/** Convert a Uint8Array to a binary string (one char per byte). */
export function bytesToBinaryString(bytes: Uint8Array): string {
  // String.fromCharCode + spread blows the stack on large buffers; chunk it.
  const CHUNK = 0x8000;
  let out = '';
  for (let i = 0; i < bytes.length; i += CHUNK) {
    const slice = bytes.subarray(i, Math.min(i + CHUNK, bytes.length));
    out += String.fromCharCode.apply(null, Array.from(slice));
  }
  return out;
}

/** Convert a binary string back to a Uint8Array. */
export function binaryStringToBytes(binary: string): Uint8Array {
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    out[i] = binary.charCodeAt(i) & 0xff;
  }
  return out;
}

// String → TagValues lookup for each IFD. Used to map a flat EXIF object's
// friendly key names (e.g. "GPSLatitude", "Software") into the numeric tag
// IDs piexif-ts uses internally.
const ZEROTH_KEYS: Record<string, number> = {};
for (const [name, id] of Object.entries(TagValues.ImageIFD)) {
  ZEROTH_KEYS[name] = id;
}
const EXIF_KEYS: Record<string, number> = {};
for (const [name, id] of Object.entries(TagValues.ExifIFD)) {
  EXIF_KEYS[name] = id;
}
const GPS_KEYS: Record<string, number> = {};
for (const [name, id] of Object.entries(TagValues.GPSIFD)) {
  GPS_KEYS[name] = id;
}

/** Friendly-name keys that always belong in the 0th IFD. */
const ZEROTH_NAME_HINTS = new Set([
  'ImageDescription',
  'Make',
  'Model',
  'Orientation',
  'Software',
  'DateTime',
  'Artist',
  'Copyright',
  'HostComputer',
]);

/** Coerce a numeric degree value to piexif's `[[d,1],[m,1],[s,denom]]` rational. */
function degToRational(deg: number): number[][] {
  // piexif ships this helper for exactly this. Keeping our own usage explicit
  // so the call site shows what we mean.
  return piexif.GPSHelper.degToDmsRational(Math.abs(deg));
}

/** Coerce a generic number into a single rational pair, denom 1000 for 3dp precision. */
function numberToRational(n: number): number[] {
  if (!Number.isFinite(n)) return [0, 1];
  const denom = 1000;
  return [Math.round(n * denom), denom];
}

/** Best-effort decision of which IFD a friendly-named key belongs to. */
function classifyKey(name: string): keyof IfdSet | null {
  if (GPS_KEYS[name] !== undefined || name.startsWith('GPS')) return 'gps';
  if (ZEROTH_NAME_HINTS.has(name) || ZEROTH_KEYS[name] !== undefined) {
    // ImageIFD sometimes has duplicates of ExifIFD names (e.g. DateTime vs
    // DateTimeOriginal). Prefer 0th for the names we explicitly hint above,
    // and prefer Exif for anything else that lives in both maps.
    if (ZEROTH_NAME_HINTS.has(name)) return 'zeroth';
    if (EXIF_KEYS[name] !== undefined) return 'exif';
    return 'zeroth';
  }
  if (EXIF_KEYS[name] !== undefined) return 'exif';
  return null;
}

function tagIdForName(bucket: keyof IfdSet, name: string): number | null {
  if (bucket === 'gps') return GPS_KEYS[name] ?? null;
  if (bucket === 'zeroth') return ZEROTH_KEYS[name] ?? null;
  if (bucket === 'exif') return EXIF_KEYS[name] ?? null;
  return null;
}

/** Coerce a value for the named GPS tag into the shape piexif expects. */
function coerceGpsValue(name: string, raw: unknown): unknown {
  if (
    name === 'GPSLatitude' ||
    name === 'GPSLongitude' ||
    name === 'GPSDestLatitude' ||
    name === 'GPSDestLongitude'
  ) {
    if (isFiniteNumber(raw)) return degToRational(raw);
    return raw;
  }
  if (
    name === 'GPSAltitude' ||
    name === 'GPSImgDirection' ||
    name === 'GPSTrack' ||
    name === 'GPSSpeed' ||
    name === 'GPSDestBearing'
  ) {
    if (isFiniteNumber(raw)) return numberToRational(raw);
    return raw;
  }
  return raw;
}

function isNestedExifShape(input: ExifInput): input is { [k: string]: IExifElement } & ExifInput {
  return (
    typeof input === 'object' &&
    input !== null &&
    (('GPS' in input && typeof (input as Record<string, unknown>)['GPS'] === 'object') ||
      ('Exif' in input && typeof (input as Record<string, unknown>)['Exif'] === 'object') ||
      ('0th' in input && typeof (input as Record<string, unknown>)['0th'] === 'object'))
  );
}

/**
 * Translate a flat (`{ Software: 'Aniseekr', GPSLatitude: 35.0, ... }`)
 * or nested (`{ '0th': {...}, GPS: {...} }`) EXIF object into the
 * structured `IExif` shape piexif-ts needs.
 *
 * Unknown / unmapped keys are silently dropped — they are typically
 * iOS-native CFNumber metadata (lens info, color space, etc.) that we
 * cannot losslessly re-encode without a richer mapping table. Rule 8:
 * we'd rather drop a field than write a wrong one.
 */
export function flatExifToIExif(input: ExifInput | null | undefined): IExif {
  const set: IfdSet = { zeroth: {}, exif: {}, gps: {} };
  if (!input || typeof input !== 'object') return materializeIExif(set);

  // Already-nested form: merge each IFD object.
  if (isNestedExifShape(input)) {
    const nested = input as Record<string, unknown>;
    const ingestNested = (key: string, target: Ifd) => {
      const block = nested[key];
      if (!block || typeof block !== 'object') return;
      for (const [tagKey, value] of Object.entries(block as Record<string, unknown>)) {
        const numericTag = Number(tagKey);
        if (Number.isInteger(numericTag)) {
          target[numericTag] = value;
        }
      }
    };
    ingestNested('0th', set.zeroth);
    ingestNested('Exif', set.exif);
    ingestNested('GPS', set.gps);
    // Some payloads also include flat keys alongside the nested blocks; fall
    // through to the flat loop to pick those up.
  }

  for (const [name, value] of Object.entries(input)) {
    if (
      name === '0th' ||
      name === 'Exif' ||
      name === 'GPS' ||
      name === 'Interop' ||
      name === '1st' ||
      name === 'thumbnail'
    ) {
      continue;
    }
    if (value === undefined || value === null) continue;
    const bucket = classifyKey(name);
    if (!bucket) continue;
    const tagId = tagIdForName(bucket, name);
    if (tagId === null) continue;
    const coerced = bucket === 'gps' ? coerceGpsValue(name, value) : value;
    set[bucket][tagId] = coerced;
  }

  return materializeIExif(set);
}

function materializeIExif(set: IfdSet): IExif {
  const out: IExif = {};
  if (Object.keys(set.zeroth).length > 0) out['0th'] = set.zeroth as IExifElement;
  if (Object.keys(set.exif).length > 0) out.Exif = set.exif as IExifElement;
  if (Object.keys(set.gps).length > 0) out.GPS = set.gps as IExifElement;
  return out;
}

/**
 * Insert/replace the APP1 EXIF segment in the JPEG at `filePath` using the
 * EXIF metadata in `exifObject` (the flat object returned by
 * `takePictureAsync` or `PictureRef.savePictureAsync`).
 *
 * Throws on failure — callers are expected to catch, log, and fall through.
 */
export async function embedExifIntoJpegFile(
  filePath: string,
  exifObject: ExifInput
): Promise<void> {
  const file = new File(filePath);
  const bytes = await file.bytes();
  if (!bytes || bytes.length < 4) {
    throw new Error('embedExifIntoJpegFile: file is empty or too small');
  }
  // JPEG SOI = 0xFFD8.
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) {
    throw new Error('embedExifIntoJpegFile: file is not a JPEG (missing SOI)');
  }

  const iexif = flatExifToIExif(exifObject);
  if (
    (!iexif['0th'] || Object.keys(iexif['0th']).length === 0) &&
    (!iexif.Exif || Object.keys(iexif.Exif).length === 0) &&
    (!iexif.GPS || Object.keys(iexif.GPS).length === 0)
  ) {
    // Nothing meaningful to embed; treat as a no-op success.
    return;
  }

  const jpegBinary = bytesToBinaryString(bytes);
  const exifBinary = piexif.dump(iexif);
  const merged = piexif.insert(exifBinary, jpegBinary);
  const newBytes = binaryStringToBytes(merged);

  if (file.exists) file.delete();
  file.create();
  file.write(newBytes);
}
