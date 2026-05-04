import * as Haptics from 'expo-haptics';
import { NativeModules, Platform } from 'react-native';

type ImpactType = 'light' | 'medium' | 'heavy';
type NotificationType = 'success' | 'warning' | 'error';

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
  | 'pressIn'
  | 'pressOut'
  | 'swipeThreshold'
  | 'swipeCancel'
  | 'tap'
  | 'longPress'
  | 'success'
  | 'warning'
  | 'error',
  Pattern
> = {
  pressIn: { pattern: [0, 12], amplitudes: [0, 160] },
  pressOut: { pattern: [0, 10], amplitudes: [0, 110] },
  swipeThreshold: { pattern: [0, 14, 6], amplitudes: [0, 200, 0] },
  swipeCancel: { pattern: [0, 8], amplitudes: [0, 80] },
  tap: { pattern: [0, 10], amplitudes: [0, 130] },
  longPress: { pattern: [0, 22], amplitudes: [0, 220] },
  success: { pattern: [0, 12, 60, 18], amplitudes: [0, 180, 0, 230] },
  warning: { pattern: [0, 10, 80, 10], amplitudes: [0, 200, 0, 200] },
  error: { pattern: [0, 18, 80, 18, 80, 18], amplitudes: [0, 240, 0, 240, 0, 240] },
};

function callNative(fn: (() => void) | undefined) {
  try {
    fn?.();
    return true;
  } catch {
    return false;
  }
}

function playPattern(pattern: Pattern, fallback?: () => Promise<void> | void) {
  if (Platform.OS === 'android' && Native?.custom) {
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
    if (Platform.OS === 'android' && callNative(Native?.selection)) return;
    Haptics.selectionAsync();
  },
  selectionSoft() {
    if (Platform.OS === 'android' && callNative(Native?.selectionSoft)) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  },
  impact(type: ImpactType) {
    if (Platform.OS === 'android') {
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
  notification(type: NotificationType) {
    const fallback = () => {
      const map: Record<NotificationType, Haptics.NotificationFeedbackType> = {
        success: Haptics.NotificationFeedbackType.Success,
        warning: Haptics.NotificationFeedbackType.Warning,
        error: Haptics.NotificationFeedbackType.Error,
      };
      Haptics.notificationAsync(map[type]);
    };
    playPattern(ANDROID_PATTERNS[type], fallback);
  },
  success() {
    this.notification('success');
  },
  warning() {
    this.notification('warning');
  },
  error() {
    this.notification('error');
  },
  tap() {
    playPattern(ANDROID_PATTERNS.tap, () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
  },
  longPress() {
    playPattern(ANDROID_PATTERNS.longPress, () =>
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy)
    );
  },
  custom(pattern: number[], amplitudes?: number[]) {
    const validatedPattern = pattern.map((n) => Math.max(0, Math.floor(n)));
    const validatedAmps = (amplitudes || []).map((n) => Math.max(0, Math.min(255, Math.floor(n))));
    if (Platform.OS === 'android' && Native?.custom) {
      try {
        Native.custom(validatedPattern, validatedAmps);
        return;
      } catch {
        // fall through
      }
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  },
  cardDraw() {
    if (Platform.OS === 'android' && Native?.custom) {
      this.custom([0, 400, 50, 40], [128, 255]);
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setTimeout(() => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    }, 400);
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
    playPattern(ANDROID_PATTERNS.swipeCancel, () => Haptics.selectionAsync());
  },
};

export type { ImpactType, NotificationType };
