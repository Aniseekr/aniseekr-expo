// Track D Phase 1 — SubjectLifter loader (on-device background removal / 去背).
//
// Detects the native `AniseekrSubjectLifter` module (installed by
// plugins/with-subject-lifter.js during `expo prebuild`) and prefers it when
// available. Falls back to a JS-only path that returns the input image
// untouched — per CLAUDE.md rule 8 we'd rather honestly say "no lift
// performed" (hasAlpha: false) than invent alpha pixels.
//
// Native implementation:
//   iOS  — Vision: VNGenerateForegroundInstanceMaskRequest (iOS 17+),
//          VNGeneratePersonSegmentationRequest fallback (iOS 15/16).
//   Android — ML Kit Subject Segmentation (enableForegroundBitmap).
// Both write a transparent PNG cutout to the app cache and resolve its uri.

import { NativeModules, Platform } from 'react-native';

/**
 * Output of a subject lift. Width/height match the *cutout* (after subject
 * extraction). `hasAlpha` is `true` only when the native side actually
 * performed segmentation; the JS fallback sets it `false`.
 */
export interface SubjectLifterResult {
  uri: string;
  width: number;
  height: number;
  hasAlpha: boolean;
}

export interface SubjectLifter {
  isSupported(): boolean;
  lift(imageUri: string): Promise<SubjectLifterResult>;
}

interface NativeSubjectLifterModule {
  /** Exported constant — true iff this build can segment on-device. */
  isSupported?: boolean;
  lift(imageUri: string): Promise<SubjectLifterResult>;
}

export const jsSubjectLifter: SubjectLifter = {
  isSupported: () => false,
  async lift(uri: string): Promise<SubjectLifterResult> {
    if (!uri || typeof uri !== 'string') {
      throw new Error('subject-lifter: imageUri must be a non-empty string');
    }
    // Intrinsic dimensions need a native decode. The companion screen calls
    // Image.getSize before persisting, so leave at 0 here — the store fills
    // them in from the caller's measurement.
    return { uri, width: 0, height: 0, hasAlpha: false };
  },
};

function tryLoadNative(): SubjectLifter | null {
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') return null;
  const native = (NativeModules as Record<string, unknown>).AniseekrSubjectLifter as
    | NativeSubjectLifterModule
    | undefined;
  // Module missing (no native binding in this build / Expo Go), or the device
  // reports it can't segment.
  if (!native || native.isSupported !== true || typeof native.lift !== 'function') {
    return null;
  }
  return {
    isSupported: () => true,
    lift: (uri: string) => {
      if (!uri || typeof uri !== 'string') {
        return Promise.reject(new Error('subject-lifter: imageUri must be a non-empty string'));
      }
      return native.lift(uri);
    },
  };
}

const nativeLifter = tryLoadNative();

/**
 * Active lifter. Prefer the native implementation; otherwise the JS fallback.
 * The UI never throws on missing native support — it just sees
 * `isSupported() === false` and offers the "Use as-is" path.
 */
export const subjectLifter: SubjectLifter = nativeLifter ?? jsSubjectLifter;
