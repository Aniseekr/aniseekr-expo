import { ImageFormat, Skia } from '@shopify/react-native-skia';
import type { SkImage } from '@shopify/react-native-skia';
import { File, Paths } from 'expo-file-system';
import { embedExifIntoJpegFile } from '../../utils/exif-embed';
import { resolveSceneCutout } from './subject-cutout';
import {
  resolveSubjectCompositePlan,
  type SubjectCompositeTransform,
} from './subject-composite-plan';

export interface CompositeSubjectIntoPhotoInput {
  photoUri: string;
  referenceUri: string;
  photoWidth: number;
  photoHeight: number;
  previewWidth: number;
  previewHeight: number;
  opacity: number;
  transform: SubjectCompositeTransform;
  quality?: number;
  exif?: Record<string, unknown> | null;
}

export interface CompositeSubjectIntoPhotoResult {
  uri: string;
  width: number;
  height: number;
}

const DEFAULT_QUALITY = 0.92;

function validPositive(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

export async function compositeSubjectIntoPhoto(
  input: CompositeSubjectIntoPhotoInput
): Promise<CompositeSubjectIntoPhotoResult> {
  const quality = input.quality ?? DEFAULT_QUALITY;
  let photoImage: SkImage | null = null;
  let subjectImage: SkImage | null = null;
  let snapshot: SkImage | null = null;
  let surface: ReturnType<typeof Skia.Surface.MakeOffscreen> | null = null;

  try {
    const photoData = await Skia.Data.fromURI(input.photoUri);
    if (!photoData) throw new Error('Failed to load photo data');
    photoImage = Skia.Image.MakeImageFromEncoded(photoData);
    if (!photoImage) throw new Error('Failed to decode photo');

    const width = input.photoWidth || photoImage.width();
    const height = input.photoHeight || photoImage.height();
    if (!validPositive(width) || !validPositive(height)) {
      throw new Error('Photo has zero dimensions');
    }

    // Real background removal (去背) — same cut-out the live preview lifted,
    // not the old elliptical matte. Falls back to the full scene when the
    // native lifter is unavailable (honest, never a fabricated mask).
    const cutout = await resolveSceneCutout(input.referenceUri);
    const subjectData = await Skia.Data.fromURI(cutout.uri);
    if (!subjectData) throw new Error('Failed to load subject cut-out data');
    subjectImage = Skia.Image.MakeImageFromEncoded(subjectData);
    if (!subjectImage) throw new Error('Failed to decode subject cut-out');

    const plan = resolveSubjectCompositePlan({
      photoWidth: width,
      photoHeight: height,
      previewWidth: input.previewWidth,
      previewHeight: input.previewHeight,
      subjectWidth: subjectImage.width(),
      subjectHeight: subjectImage.height(),
      opacity: input.opacity,
      transform: input.transform,
    });
    if (!plan) throw new Error('Failed to resolve subject composite placement');

    surface = Skia.Surface.MakeOffscreen(width, height);
    if (!surface) throw new Error('Failed to allocate Skia surface');

    const canvas = surface.getCanvas();
    const basePaint = Skia.Paint();
    canvas.drawImage(photoImage, 0, 0, basePaint);

    const subjectPaint = Skia.Paint();
    subjectPaint.setAlphaf(plan.opacity);

    canvas.save();
    canvas.translate(plan.centerX + plan.translateX, plan.centerY + plan.translateY);
    canvas.rotate(plan.rotationDeg, 0, 0);
    canvas.scale(plan.scale * plan.flipScaleX, plan.scale);
    canvas.translate(-plan.centerX, -plan.centerY);
    canvas.drawImageRect(subjectImage, plan.srcRect, plan.dstRect, subjectPaint);
    canvas.restore();
    surface.flush();

    snapshot = surface.makeImageSnapshot();
    const jpegBytes = snapshot.encodeToBytes(ImageFormat.JPEG, Math.round(quality * 100));
    if (!jpegBytes || jpegBytes.length === 0) {
      throw new Error('Encoded subject composite JPEG was empty');
    }

    const file = new File(Paths.cache, `subject-composite-${Date.now()}.jpg`);
    if (file.exists) file.delete();
    file.create();
    file.write(jpegBytes);

    if (input.exif && typeof input.exif === 'object') {
      try {
        await embedExifIntoJpegFile(file.uri, input.exif);
      } catch (embedError) {
        console.warn('[subject-composite] EXIF embed failed', embedError);
      }
    }

    return { uri: file.uri, width, height };
  } catch (error) {
    console.warn('[subject-composite]', error);
    return { uri: input.photoUri, width: input.photoWidth, height: input.photoHeight };
  } finally {
    snapshot?.dispose();
    surface?.dispose();
    subjectImage?.dispose();
    photoImage?.dispose();
  }
}
