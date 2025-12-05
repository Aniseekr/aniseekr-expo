import * as Haptics from "expo-haptics";
import { NativeModules, Platform } from "react-native";

type ImpactType = "light" | "medium" | "heavy";

type Pattern = { pattern: number[]; amplitudes: number[] };

const Native = NativeModules.AniseekrVibration as
  | {
      selection(): void;
      selectionSoft(): void;
      impact(type: ImpactType): void;
      custom(pattern: number[], amplitudes?: number[]): void;
    }
  | undefined;

const ANDROID_PATTERNS: Record<
  "pressIn" | "pressOut" | "swipeThreshold" | "swipeCancel",
  Pattern
> = {
  pressIn: { pattern: [0, 12], amplitudes: [0, 160] },
  pressOut: { pattern: [0, 10], amplitudes: [0, 110] },
  swipeThreshold: { pattern: [0, 14, 6], amplitudes: [0, 200, 0] },
  swipeCancel: { pattern: [0, 8], amplitudes: [0, 80] },
};

function callNative(fn: (() => void) | undefined) {
  try {
    fn?.();
    return true;
  } catch {
    return false;
  }
}

function playPattern(pattern: Pattern, fallback?: () => Promise<void>) {
  if (Platform.OS === "android" && Native?.custom) {
    try {
      Native.custom(pattern.pattern, pattern.amplitudes);
      return;
    } catch {
      // fall through
    }
  }
  fallback?.();
}

export const hapticsBridge = {
  selection() {
    if (Platform.OS === "android" && callNative(Native?.selection)) return;
    Haptics.selectionAsync();
  },
  selectionSoft() {
    if (Platform.OS === "android" && callNative(Native?.selectionSoft)) return;
    Haptics.selectionAsync();
  },
  impact(type: ImpactType) {
    if (Platform.OS === "android") {
      if (Native?.impact) {
        try {
          Native.impact(type);
          return;
        } catch {
          // fall through
        }
      }
    }
    const map: Record<ImpactType, Haptics.ImpactFeedbackStyle> = {
      light: Haptics.ImpactFeedbackStyle.Light,
      medium: Haptics.ImpactFeedbackStyle.Medium,
      heavy: Haptics.ImpactFeedbackStyle.Heavy,
    };
    Haptics.impactAsync(map[type]);
  },
  custom(pattern: number[], amplitudes?: number[]) {
    const validatedPattern = pattern.map((n) => Math.max(0, Math.floor(n)));
    const validatedAmps = (amplitudes || []).map((n) => Math.max(0, Math.min(255, Math.floor(n))));
    if (Platform.OS === "android" && Native?.custom) {
      try {
        Native.custom(validatedPattern, validatedAmps);
        return;
      } catch {
        // fall through
      }
    }
    // Best-effort fallback: use notification haptic
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  },
  pressIn() {
    playPattern(ANDROID_PATTERNS.pressIn, () =>
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
    );
  },
  pressOut() {
    playPattern(ANDROID_PATTERNS.pressOut, () =>
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    );
  },
  swipeThreshold() {
    playPattern(ANDROID_PATTERNS.swipeThreshold, () =>
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
    );
  },
  swipeCancel() {
    playPattern(ANDROID_PATTERNS.swipeCancel, () =>
      Haptics.selectionAsync()
    );
  },
};

