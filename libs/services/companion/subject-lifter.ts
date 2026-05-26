// Track D Phase 1 — SubjectLifter loader.
//
// Detects the Nitro-generated `SubjectLifter` HybridObject at runtime and
// prefers it when available. Falls back to a JS-only path that returns the
// input image untouched — per CLAUDE.md rule 8 we'd rather honestly say
// "no lift performed" than invent alpha pixels.
//
// See `./subject-lifter.nitro.ts` for the Nitrogen spec, and run
// `bunx nitrogen --paths libs/services/companion` after changing it.

import type { SubjectLifter as NativeSubjectLifter, SubjectLifterResult } from './subject-lifter.nitro';

export type { SubjectLifterResult };

export interface SubjectLifter {
  isSupported(): boolean;
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
  try {
    // Lazy require so node/bun test environments don't fail on the native
    // turbomodule install path (NitroModules tries to install at import
    // time when the module is bound).
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('react-native-nitro-modules') as {
      NitroModules: {
        createHybridObject<T>(name: string): T;
      };
    };
    const native = mod.NitroModules.createHybridObject<NativeSubjectLifter>('SubjectLifter');
    if (!native || !native.isSupported) return null;
    return {
      isSupported: () => native.isSupported,
      lift: (uri: string) => native.lift(uri),
    };
  } catch {
    // Module not registered (no native binding generated yet, or this build
    // doesn't include the Nitro-compiled artefacts; tests also land here).
    return null;
  }
}

const nativeLifter = tryLoadNative();

/**
 * Active lifter. Prefer the native implementation; otherwise the JS
 * fallback. The UI never throws on missing native support — it just sees
 * `isSupported() === false` and offers the "Use as-is" path.
 */
export const subjectLifter: SubjectLifter = nativeLifter ?? jsSubjectLifter;

/** True iff the native Nitro module is wired up and reports support. */
export function hasNativeSubjectLifter(): boolean {
  return nativeLifter !== null && nativeLifter.isSupported();
}
