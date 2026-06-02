import { Skia } from '@shopify/react-native-skia';

export type CameraEngineFacing = 'front' | 'back';
export type CameraPhysicalDevicePreference = 'ultra-wide-angle' | 'wide-angle' | 'telephoto';

export interface PhotoDimensions {
  width: number;
  height: number;
}

const BACK_CAMERA_PHYSICAL_DEVICES: readonly CameraPhysicalDevicePreference[] = [
  'ultra-wide-angle',
  'wide-angle',
  'telephoto',
];
const FRONT_CAMERA_PHYSICAL_DEVICES: readonly CameraPhysicalDevicePreference[] = ['wide-angle'];

export function preferredPhysicalDevicesForFacing(
  facing: CameraEngineFacing
): readonly CameraPhysicalDevicePreference[] {
  return facing === 'back' ? BACK_CAMERA_PHYSICAL_DEVICES : FRONT_CAMERA_PHYSICAL_DEVICES;
}

function isPositiveFinite(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function validDimensions(
  dimensions: PhotoDimensions | null | undefined
): dimensions is PhotoDimensions {
  return isPositiveFinite(dimensions?.width) && isPositiveFinite(dimensions?.height);
}

export function pickResolvedPhotoDimensions({
  decoded,
  fallback,
}: {
  decoded: PhotoDimensions | null | undefined;
  fallback: PhotoDimensions | null | undefined;
}): PhotoDimensions {
  if (validDimensions(decoded)) return decoded;
  if (validDimensions(fallback)) return fallback;
  return { width: 0, height: 0 };
}

async function decodePhotoDimensions(uri: string): Promise<PhotoDimensions | null> {
  let image: ReturnType<typeof Skia.Image.MakeImageFromEncoded> | null = null;
  try {
    const data = await Skia.Data.fromURI(uri);
    if (!data) return null;
    image = Skia.Image.MakeImageFromEncoded(data);
    if (!image) return null;
    return pickResolvedPhotoDimensions({
      decoded: { width: image.width(), height: image.height() },
      fallback: null,
    });
  } catch (error) {
    console.warn('[camera-engine-parity] decodePhotoDimensions failed', error);
    return null;
  } finally {
    image?.dispose?.();
  }
}

export async function resolveCapturedPhotoDimensions(
  uri: string,
  fallback: PhotoDimensions
): Promise<PhotoDimensions> {
  const decoded = await decodePhotoDimensions(uri);
  return pickResolvedPhotoDimensions({ decoded, fallback });
}
