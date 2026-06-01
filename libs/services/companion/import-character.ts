// Shared "import a character image" flow for the companion feature.
//
// One code path for both the in-camera picker sheet and the standalone
// character album: pick from the photo library → run the subject lifter (去背)
// → measure the cutout → build a CharacterEntry. Honest about failure: if
// segmentation can't find a subject (or no native lifter is installed), the
// original image is imported as-is with `hasAlpha: false` so the UI can badge
// it "not cut out" rather than pretend (CLAUDE.md rule 8).

import { Image as RNImage } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { subjectLifter } from './subject-lifter';
import type { CharacterEntry } from './character-library';

export type ImportOutcome =
  | { status: 'cancelled' }
  | { status: 'denied' }
  | { status: 'ok'; entry: CharacterEntry; cutout: boolean };

export interface ImportOptions {
  /** When adding an angle to an existing character, its shared groupId. */
  groupId?: string;
  /** Display name to apply (e.g. the existing character's name). */
  displayName?: string;
  /** Optional pose/angle label. */
  angleLabel?: string;
}

export async function importCharacterFromLibrary(opts: ImportOptions = {}): Promise<ImportOutcome> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) return { status: 'denied' };

  const picked = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: false,
    quality: 1,
  });
  if (picked.canceled || picked.assets.length === 0) return { status: 'cancelled' };
  const asset = picked.assets[0];

  let cutoutUri = asset.uri;
  let hasAlpha = false;
  try {
    const lifted = await subjectLifter.lift(asset.uri);
    cutoutUri = lifted.uri;
    hasAlpha = lifted.hasAlpha;
  } catch {
    // Segmentation failed / no subject / no native module — keep the original.
    cutoutUri = asset.uri;
    hasAlpha = false;
  }

  const { width, height } = await measure(cutoutUri, asset);
  const entry: CharacterEntry = {
    id: `char_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    displayName: opts.displayName ?? asset.fileName?.replace(/\.[^.]+$/, '') ?? 'Character',
    sourceUri: asset.uri,
    cutoutUri,
    thumbUri: cutoutUri,
    intrinsicW: width,
    intrinsicH: height,
    createdAt: Date.now(),
    hasAlpha,
    ...(opts.groupId ? { groupId: opts.groupId } : {}),
    ...(opts.angleLabel ? { angleLabel: opts.angleLabel } : {}),
  };
  return { status: 'ok', entry, cutout: hasAlpha };
}

async function measure(
  uri: string,
  asset: ImagePicker.ImagePickerAsset
): Promise<{ width: number; height: number }> {
  // The native lifter reports real cutout dims; the JS fallback returns the
  // picked asset untouched, so its width/height are correct there too.
  if (asset.width && asset.height) return { width: asset.width, height: asset.height };
  return new Promise((resolve) => {
    RNImage.getSize(
      uri,
      (w, h) => resolve({ width: w, height: h }),
      () => resolve({ width: 512, height: 768 })
    );
  });
}
