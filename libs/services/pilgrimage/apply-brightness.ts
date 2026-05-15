// Post-capture brightness baking. expo-camera v17 has no exposure control, so
// `useBrightnessPreview` produces a Skia ColorMatrix that we apply to the
// captured frame on disk — that's what makes the ExposureChip's brightness
// REAL instead of a preview-only overlay. The shutter callback awaits this
// function, then the rest of the app (preview screen, share card, gallery)
// consumes the new URI as if it were the original photo.
//
// Identity short-circuit: when EV = 0 the user wants the unmodified photo.
// `useBrightnessPreview` builds the diagonal-1 matrix (R/G/B scale = 2^0 = 1).
// Re-encoding through JPEG would double-compress the original without changing
// a pixel, so we detect identity and return the input URI unchanged. The
// caller still gets width/height because the preview screen needs them, but
// we decode-only (no surface, no encode, no write).
//
// On error (decode fail, surface fail, encode fail, write fail) we log and
// return the original URI. Losing the brightness adjustment is preferable to
// losing the captured frame.
//
// CLAUDE.md Rule 8: no fake URIs. We never return a path that doesn't exist
// on disk — failure always falls back to `inputUri`.

import { Skia, ImageFormat } from '@shopify/react-native-skia';
import { File, Paths } from 'expo-file-system';

export interface ApplyBrightnessInput {
  inputUri: string;
  colorMatrix: number[] | null | undefined;
  quality?: number;
}

export interface ApplyBrightnessResult {
  uri: string;
  width: number;
  height: number;
}

const DEFAULT_QUALITY = 0.92;

// Indices 0, 6, 12, 18 are the R, G, B, A diagonal scale factors. When all
// four are exactly 1 the matrix is the identity transform and re-encoding
// would just be a lossy round-trip.
function isIdentityMatrix(m: number[] | null | undefined): boolean {
  if (!m || m.length !== 20) return true;
  return m[0] === 1 && m[6] === 1 && m[12] === 1 && m[18] === 1;
}

export async function applyBrightnessToImage(
  input: ApplyBrightnessInput
): Promise<ApplyBrightnessResult> {
  const { inputUri, colorMatrix } = input;
  const quality = input.quality ?? DEFAULT_QUALITY;
  const identity = isIdentityMatrix(colorMatrix);

  // Decode is required either way: identity callers still need width/height
  // for the preview layout, and non-identity needs the image to draw.
  let skImage: ReturnType<typeof Skia.Image.MakeImageFromEncoded> | null = null;
  try {
    const data = await Skia.Data.fromURI(inputUri);
    if (!data) throw new Error('Failed to load image data');

    skImage = Skia.Image.MakeImageFromEncoded(data);
    if (!skImage) throw new Error('Failed to decode image');

    const width = skImage.width();
    const height = skImage.height();
    if (!width || !height) throw new Error('Image has zero dimensions');

    if (identity) {
      return { uri: inputUri, width, height };
    }

    const surface = Skia.Surface.MakeOffscreen(width, height);
    if (!surface) throw new Error('Failed to allocate Skia surface');

    let paint: ReturnType<typeof Skia.Paint> | null = null;
    let snapshot: ReturnType<typeof surface.makeImageSnapshot> | null = null;
    try {
      const filter = Skia.ColorFilter.MakeMatrix(colorMatrix as number[]);
      paint = Skia.Paint();
      paint.setColorFilter(filter);

      surface.getCanvas().drawImage(skImage, 0, 0, paint);
      surface.flush();

      snapshot = surface.makeImageSnapshot();
      const jpegBytes = snapshot.encodeToBytes(ImageFormat.JPEG, Math.round(quality * 100));
      if (!jpegBytes || jpegBytes.length === 0) {
        throw new Error('Encoded JPEG was empty');
      }

      const filename = `brightness-${Date.now()}.jpg`;
      const file = new File(Paths.cache, filename);
      if (file.exists) file.delete();
      file.create();
      file.write(jpegBytes);

      return { uri: file.uri, width, height };
    } finally {
      snapshot?.dispose();
      paint?.dispose();
      surface.dispose();
    }
  } catch (error) {
    console.warn('[applyBrightnessToImage]', error);
    const fallbackWidth = skImage?.width() ?? 0;
    const fallbackHeight = skImage?.height() ?? 0;
    return { uri: inputUri, width: fallbackWidth, height: fallbackHeight };
  } finally {
    skImage?.dispose();
  }
}
