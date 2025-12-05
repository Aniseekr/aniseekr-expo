import * as Haptics from "expo-haptics";
import { NativeModules, Platform } from "react-native";

type ImpactType = "light" | "medium" | "heavy";

const Native = NativeModules.AniseekrVibration as
  | {
      selection(): void;
      selectionSoft(): void;
      impact(type: ImpactType): void;
      custom(pattern: number[], amplitudes?: number[]): void;
    }
  | undefined;

function callNative(fn: (() => void) | undefined) {
  try {
    fn?.();
    return true;
  } catch {
    return false;
  }
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
    if (Platform.OS === "android" && Native?.custom) {
      try {
        Native.custom(pattern, amplitudes || []);
        return;
      } catch {
        // fall through
      }
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  },
};

