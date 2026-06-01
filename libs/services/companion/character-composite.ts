// Track D Phase 1C — bake the companion character cut-out into the captured
// photo. The live preview places the character via <CharacterLayer/> (Reanimated
// transform); at capture we read that transform and redraw the cut-out onto the
// full-resolution JPEG with Skia, using the SAME coordinate convention as the
// subject (ellipse) compositor so placement matches what the user saw.
//
// On any failure the original photo is returned unchanged — never a fabricated
// composite (CLAUDE.md rule 8).

import { ImageFormat, Skia } from '@shopify/react-native-skia';
import type { SkImage } from '@shopify/react-native-skia';
import { File, Paths } from 'expo-file-system';
import { embedExifIntoJpegFile } from '../../utils/exif-embed';

/** Snapshot of <CharacterLayer/>'s live gesture transform at capture time. */
export interface CharacterTransformSnapshot {
  translateX: number;
  translateY: number;
  scale: number;
  /** Radians (matches Reanimated rotateZ). */
  rotation: number;
  flipX: 1 | -1;
}

export interface CompositeCharacterIntoPhotoInput {
  photoUri: string;
  photoWidth: number;
  photoHeight: number;
  previewWidth: number;
  previewHeight: number;
  cutoutUri: string;
  intrinsicW: number;
  intrinsicH: number;
  /** Fraction of preview height the layer starts at (CharacterLayer default 0.6). */
  initialHeightFraction?: number;
  transform: CharacterTransformSnapshot;
  quality?: number;
  exif?: Record<string, unknown> | null;
}

export interface CompositeCharacterIntoPhotoResult {
  uri: string;
  width: number;
  height: number;
}

const DEFAULT_QUALITY = 0.92;
const DEFAULT_HEIGHT_FRACTION = 0.6;
const MIN_LAYER_HEIGHT = 120;

function validPositive(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

export async function compositeCharacterIntoPhoto(
  input: CompositeCharacterIntoPhotoInput
): Promise<CompositeCharacterIntoPhotoResult> {
  const quality = input.quality ?? DEFAULT_QUALITY;
  let photoImage: SkImage | null = null;
  let cutoutImage: SkImage | null = null;
  let snapshot: SkImage | null = null;
  let surface: ReturnType<typeof Skia.Surface.MakeOffscreen> | null = null;

  try {
    const photoData = await Skia.Data.fromURI(input.photoUri);
    if (!photoData) throw new Error('Failed to load photo data');
    photoImage = Skia.Image.MakeImageFromEncoded(photoData);
    if (!photoImage) throw new Error('Failed to decode photo');

    const width = input.photoWidth || photoImage.width();
    const height = input.photoHeight || photoImage.height();
    if (
      !validPositive(width) ||
      !validPositive(height) ||
      !validPositive(input.previewWidth) ||
      !validPositive(input.previewHeight)
    ) {
      throw new Error('Photo or preview has zero dimensions');
    }

    const cutoutData = await Skia.Data.fromURI(input.cutoutUri);
    if (!cutoutData) throw new Error('Failed to load cutout data');
    cutoutImage = Skia.Image.MakeImageFromEncoded(cutoutData);
    if (!cutoutImage) throw new Error('Failed to decode cutout');
    const srcW = cutoutImage.width();
    const srcH = cutoutImage.height();
    if (!validPositive(srcW) || !validPositive(srcH)) {
      throw new Error('Cutout has zero dimensions');
    }

    // Reconstruct the layer's base rect the way CharacterLayer does: centred,
    // height = max(120, previewH * fraction) in preview px, width via aspect.
    const aspect =
      input.intrinsicW > 0 && input.intrinsicH > 0
        ? input.intrinsicW / input.intrinsicH
        : srcW / srcH;
    const heightFraction = input.initialHeightFraction ?? DEFAULT_HEIGHT_FRACTION;
    const baseHeightPreview = Math.max(MIN_LAYER_HEIGHT, input.previewHeight * heightFraction);

    const sx = width / input.previewWidth;
    const sy = height / input.previewHeight;
    const baseHeightPhoto = baseHeightPreview * sy;
    const baseWidthPhoto = baseHeightPhoto * aspect;

    const dstRect = {
      x: width / 2 - baseWidthPhoto / 2,
      y: height / 2 - baseHeightPhoto / 2,
      width: baseWidthPhoto,
      height: baseHeightPhoto,
    };
    const srcRect = { x: 0, y: 0, width: srcW, height: srcH };

    surface = Skia.Surface.MakeOffscreen(width, height);
    if (!surface) throw new Error('Failed to allocate Skia surface');
    const canvas = surface.getCanvas();
    canvas.drawImage(photoImage, 0, 0, Skia.Paint());

    const centerX = width / 2;
    const centerY = height / 2;
    const translateX = input.transform.translateX * sx;
    const translateY = input.transform.translateY * sy;
    const scale = validPositive(input.transform.scale) ? input.transform.scale : 1;
    const rotationDeg = (input.transform.rotation * 180) / Math.PI;
    const flipScaleX = input.transform.flipX === -1 ? -1 : 1;

    canvas.save();
    canvas.translate(centerX + translateX, centerY + translateY);
    canvas.rotate(rotationDeg, 0, 0);
    canvas.scale(scale * flipScaleX, scale);
    canvas.translate(-centerX, -centerY);
    canvas.drawImageRect(cutoutImage, srcRect, dstRect, Skia.Paint());
    canvas.restore();
    surface.flush();

    snapshot = surface.makeImageSnapshot();
    const jpegBytes = snapshot.encodeToBytes(ImageFormat.JPEG, Math.round(quality * 100));
    if (!jpegBytes || jpegBytes.length === 0) {
      throw new Error('Encoded character composite JPEG was empty');
    }

    const file = new File(Paths.cache, `character-composite-${Date.now()}.jpg`);
    if (file.exists) file.delete();
    file.create();
    file.write(jpegBytes);

    if (input.exif && typeof input.exif === 'object') {
      try {
        await embedExifIntoJpegFile(file.uri, input.exif);
      } catch (embedError) {
        console.warn('[character-composite] EXIF embed failed', embedError);
      }
    }

    return { uri: file.uri, width, height };
  } catch (error) {
    console.warn('[character-composite]', error);
    return { uri: input.photoUri, width: input.photoWidth, height: input.photoHeight };
  } finally {
    snapshot?.dispose();
    surface?.dispose();
    cutoutImage?.dispose();
    photoImage?.dispose();
  }
}
