// Nitrogen spec for the companion subject lifter (Track D Phase 1, native).
//
// Nitrogen consumes any `.nitro.ts` file that declares a `HybridObject`
// interface and emits:
//
//   - iOS:     a Swift protocol + Objective-C++ glue (`HybridSubjectLifterSpec`)
//   - Android: a Kotlin abstract class (`HybridSubjectLifterSpec`)
//   - JS:      a typed handle wired through `NitroModules.createHybridObject`
//
// To regenerate native scaffolding after editing this file:
//
//     bunx nitrogen --paths libs/services/companion
//
// Then implement the native side:
//
//   iOS (Swift, iOS 17+):
//     - Use `VisionKit.ImageAnalyzer` +
//       `VNGenerateForegroundInstanceMaskRequest` for the lift,
//       fall back to `VNGeneratePersonSegmentationRequest` on iOS 16.
//   Android:
//     - Use `com.google.mlkit:subject-segmentation`.
//
// Until the native module ships, the loader in `./subject-lifter.ts`
// detects the missing implementation and falls back to `jsSubjectLifter`.

import type { HybridObject } from 'react-native-nitro-modules';

/**
 * Output of a successful subject lift. Width/height match the *cutout*
 * (after subject extraction) — not the input. `hasAlpha` MUST be `true`
 * when the native side actually performed segmentation; the JS fallback
 * sets it `false`.
 */
export interface SubjectLifterResult {
  uri: string;
  width: number;
  height: number;
  hasAlpha: boolean;
}

export interface SubjectLifter extends HybridObject<{ ios: 'swift'; android: 'kotlin' }> {
  /** Returns true iff the device + OS pair supports background removal. */
  readonly isSupported: boolean;

  /**
   * Lift the foreground subject out of `imageUri`. The native side decodes
   * the image, runs segmentation, and writes the cutout (with transparency)
   * to the app cache directory.
   */
  lift(imageUri: string): Promise<SubjectLifterResult>;
}
