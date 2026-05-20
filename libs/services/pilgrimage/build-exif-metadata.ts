/**
 * Build additional EXIF metadata for a pilgrimage capture.
 *
 * Output keys use standard EXIF tag names so the camera metadata embed step
 * can write them into the JPEG. Rule 8 (no fake data) is strictly enforced:
 * any field whose source is missing or non-finite is OMITTED from the output
 * entirely. We never write `0` for missing GPS or `'Unknown'` for a missing
 * title.
 */

export interface ExifMetadataInput {
  spotId: string;
  spotName: string;
  animeId?: string;
  animeTitle?: string;
  episode?: string;
  userLocation?: {
    latitude: number;
    longitude: number;
    altitude?: number | null;
  } | null;
  heading?: number | null;
  tilt?: number | null;
  /** Date.now() at capture time. Defaults to Date.now() if omitted. */
  capturedAt?: number;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/**
 * Format a timestamp as the EXIF DateTimeOriginal format:
 * `YYYY:MM:DD HH:MM:SS` (local time).
 */
function formatExifDateTime(ms: number): string {
  const d = new Date(ms);
  const year = d.getFullYear();
  const month = pad2(d.getMonth() + 1);
  const day = pad2(d.getDate());
  const hour = pad2(d.getHours());
  const minute = pad2(d.getMinutes());
  const second = pad2(d.getSeconds());
  return `${year}:${month}:${day} ${hour}:${minute}:${second}`;
}

/**
 * Compose a human-readable ImageDescription from spot/anime/episode.
 * Segments whose source is missing are omitted; the result never
 * contains placeholder dashes for empty fields.
 */
function composeImageDescription(input: ExifMetadataInput): string {
  const parts: string[] = [];
  if (isNonEmptyString(input.spotName)) parts.push(input.spotName);
  let result = parts.join('');
  if (isNonEmptyString(input.animeTitle)) {
    result = result.length > 0 ? `${result} — ${input.animeTitle}` : input.animeTitle;
  }
  if (isNonEmptyString(input.episode)) {
    const epSegment = `EP${input.episode}`;
    result = result.length > 0 ? `${result} ${epSegment}` : epSegment;
  }
  return result;
}

interface UserCommentPayload {
  spotId?: string;
  spotName?: string;
  animeId?: string;
  animeTitle?: string;
  episode?: string;
  heading?: number;
  tilt?: number;
  capturedAt: number;
}

function buildUserCommentPayload(input: ExifMetadataInput, capturedAt: number): UserCommentPayload {
  const payload: UserCommentPayload = { capturedAt };
  if (isNonEmptyString(input.spotId)) payload.spotId = input.spotId;
  if (isNonEmptyString(input.spotName)) payload.spotName = input.spotName;
  if (isNonEmptyString(input.animeId)) payload.animeId = input.animeId;
  if (isNonEmptyString(input.animeTitle)) payload.animeTitle = input.animeTitle;
  if (isNonEmptyString(input.episode)) payload.episode = input.episode;
  if (isFiniteNumber(input.heading)) payload.heading = input.heading;
  if (isFiniteNumber(input.tilt)) payload.tilt = input.tilt;
  return payload;
}

export function buildAdditionalExif(input: ExifMetadataInput): Record<string, any> {
  const exif: Record<string, any> = {};

  // GPS — only when userLocation provides finite coordinates.
  if (input.userLocation) {
    const { latitude, longitude, altitude } = input.userLocation;
    if (isFiniteNumber(latitude) && isFiniteNumber(longitude)) {
      exif.GPSLatitude = Math.abs(latitude);
      exif.GPSLatitudeRef = latitude < 0 ? 'S' : 'N';
      exif.GPSLongitude = Math.abs(longitude);
      exif.GPSLongitudeRef = longitude < 0 ? 'W' : 'E';
      if (isFiniteNumber(altitude)) {
        exif.GPSAltitude = altitude;
      }
    }
  }

  // Heading → true-north image direction.
  if (isFiniteNumber(input.heading)) {
    exif.GPSImgDirection = input.heading;
    exif.GPSImgDirectionRef = 'T';
  }

  // Identity tags always present.
  exif.Software = 'Aniseekr';
  exif.Artist = 'Aniseekr Pilgrimage';

  // Human-readable description (omit if every source is empty).
  const description = composeImageDescription(input);
  if (description.length > 0) {
    exif.ImageDescription = description;
  }

  // Structured payload for round-tripping into the app later.
  const capturedAt = input.capturedAt ?? Date.now();
  exif.UserComment = JSON.stringify(buildUserCommentPayload(input, capturedAt));
  exif.DateTimeOriginal = formatExifDateTime(capturedAt);

  return exif;
}
