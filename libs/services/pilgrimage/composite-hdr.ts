// Pseudo-HDR compositing for the pilgrimage camera.
//
// HONEST NOTE — this fallback is NOT real HDR. Real hardware photo-HDR now
// goes through VisionCamera's PhotoHDR constraint; this module is used only
// when that capability is unavailable. It captures three frames in quick
// succession (which differ only by ambient lighting noise and motion), then
// tonemaps them in software with a Skia ColorMatrix at EV ≈ {-1, 0, +1}. The
// three tonemapped images are composited via Plus-blended weighted average
// (1/3 alpha each). It is a "tonemapped composite", not hardware HDR.
// Rule 8 (no fake data): on any decode/surface/encode failure we return the
// mid-frame URI — a real file on disk, never a fabricated path.
//
// The EV math is the same simple RGB scale used by the camera preview pipeline:
//   b = pow(2, ev)
//   matrix = [b,0,0,0,0,  0,b,0,0,0,  0,0,b,0,0,  0,0,0,1,0]
// and the file I/O is Skia.Data.fromURI → MakeImageFromEncoded → offscreen
// surface → encodeToBytes(JPEG) → write to `Paths.cache` via the
// expo-file-system modular File API.

import { Skia, ImageFormat, BlendMode } from '@shopify/react-native-skia';
import type { SkImage, SkPaint, SkSurface } from '@shopify/react-native-skia';
import { File, Paths } from 'expo-file-system';
import { embedExifIntoJpegFile } from '../../utils/exif-embed';

export interface CompositeHdrInput {
  /** Three captured-frame URIs in order: under, mid, over. */
  frameUris: [string, string, string];
  /** EV stops applied per frame to simulate bracketed exposures. Default [-1, 0, +1]. */
  evStops?: [number, number, number];
  /** Output JPEG quality 0..1. Default 0.92. */
  quality?: number;
  /** EXIF metadata to preserve after Skia re-encodes the composite JPEG. */
  exif?: Record<string, unknown> | null;
}

export interface CompositeHdrResult {
  uri: string;
  width: number;
  height: number;
}

const DEFAULT_EV_STOPS: [number, number, number] = [-1, 0, 1];
const DEFAULT_QUALITY = 0.92;
const FRAME_COUNT = 3;
const MID_INDEX = 1;

/** Build a diagonal RGB-scale ColorMatrix for one EV stop. */
function buildEvMatrix(ev: number): number[] {
  const b = Math.pow(2, ev);
  return [b, 0, 0, 0, 0, 0, b, 0, 0, 0, 0, 0, b, 0, 0, 0, 0, 0, 1, 0];
}

/**
 * Composite 3 frames into a tonemapped HDR-like JPEG via Skia. Each frame is
 * drawn with its own EV ColorMatrix and 1/3 alpha onto a single offscreen
 * surface using Plus blend mode — producing a weighted average. The dimensions
 * of the output match the FIRST frame; subsequent frames are drawn at 0,0
 * (no resize). On failure, returns the mid frame URI as a fallback.
 *
 * NOT real HDR (no hardware exposure bracketing) — see header note.
 */
export async function compositeHdr(input: CompositeHdrInput): Promise<CompositeHdrResult> {
  const { frameUris } = input;
  const evStops = input.evStops ?? DEFAULT_EV_STOPS;
  const quality = input.quality ?? DEFAULT_QUALITY;
  const exif = input.exif;
  const midUri = frameUris[MID_INDEX];

  async function withExif(uri: string, width: number, height: number): Promise<CompositeHdrResult> {
    if (exif && typeof exif === 'object') {
      try {
        await embedExifIntoJpegFile(uri, exif);
      } catch (embedError) {
        console.warn('[compositeHdr] EXIF embed failed', embedError);
      }
    }
    return { uri, width, height };
  }

  // Decode all three frames up-front. We dispose every successfully-decoded
  // image in the finally block regardless of which branch we exit through.
  const decoded: (SkImage | null)[] = [null, null, null];

  let surface: SkSurface | null = null;
  let snapshot: ReturnType<SkSurface['makeImageSnapshot']> | null = null;
  const paints: SkPaint[] = [];

  try {
    for (let i = 0; i < FRAME_COUNT; i++) {
      const data = await Skia.Data.fromURI(frameUris[i]);
      if (!data) {
        // Rule 8: never fabricate. Surface the real mid-frame URI we have.
        console.warn(`[compositeHdr] frame ${i} data load failed`);
        return withExif(midUri, 0, 0);
      }
      const img = Skia.Image.MakeImageFromEncoded(data);
      if (!img) {
        console.warn(`[compositeHdr] frame ${i} decode failed`);
        return withExif(midUri, 0, 0);
      }
      decoded[i] = img;
    }

    // Output dimensions = first frame's dimensions. The contract documents
    // this: subsequent frames are drawn at (0,0) without resizing, so any
    // mismatch is the orchestrator's problem (capture should produce
    // same-size frames anyway).
    const firstFrame = decoded[0];
    if (!firstFrame) {
      // Defensive: the loop above either fills decoded[i] or returns.
      return withExif(midUri, 0, 0);
    }
    const width = firstFrame.width();
    const height = firstFrame.height();
    if (!width || !height) {
      console.warn('[compositeHdr] first frame has zero dimensions');
      return withExif(midUri, 0, 0);
    }

    surface = Skia.Surface.MakeOffscreen(width, height);
    if (!surface) {
      console.warn('[compositeHdr] failed to allocate offscreen surface');
      return withExif(midUri, 0, 0);
    }

    const canvas = surface.getCanvas();
    const alpha = 1 / FRAME_COUNT;

    for (let i = 0; i < FRAME_COUNT; i++) {
      const img = decoded[i];
      if (!img) continue;
      const matrix = buildEvMatrix(evStops[i]);
      const filter = Skia.ColorFilter.MakeMatrix(matrix);
      const paint = Skia.Paint();
      paint.setColorFilter(filter);
      paint.setAlphaf(alpha);
      // Plus blend = additive: r = min(s + d, 1). Combined with alpha=1/3 on
      // every layer this gives a weighted average across the three frames.
      paint.setBlendMode(BlendMode.Plus);
      paints.push(paint);
      canvas.drawImage(img, 0, 0, paint);
    }

    surface.flush();
    snapshot = surface.makeImageSnapshot();
    const jpegBytes = snapshot.encodeToBytes(ImageFormat.JPEG, Math.round(quality * 100));
    if (!jpegBytes || jpegBytes.length === 0) {
      console.warn('[compositeHdr] encoded JPEG was empty');
      return withExif(midUri, width, height);
    }

    const filename = `hdr-${Date.now()}.jpg`;
    const file = new File(Paths.cache, filename);
    if (file.exists) file.delete();
    file.create();
    file.write(jpegBytes);

    return withExif(file.uri, width, height);
  } catch (error) {
    console.warn('[compositeHdr]', error);
    return withExif(midUri, 0, 0);
  } finally {
    snapshot?.dispose();
    for (const p of paints) p.dispose();
    surface?.dispose();
    for (const img of decoded) img?.dispose();
  }
}
