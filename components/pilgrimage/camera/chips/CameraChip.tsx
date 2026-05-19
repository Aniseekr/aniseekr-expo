import { Pressable, StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { ThemedText, readableTextOn } from '../../../themed';
import { hapticsBridge } from '../../../../modules/haptics/hapticsBridge';
import { CameraChrome, cameraControlShadow } from '../cameraChrome';

interface CameraChipProps {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  themeColor: string;
  /** Paints a themeColor fill — use for chips that toggle a panel open. */
  active?: boolean;
  accessibilityLabel?: string;
  onPress: () => void;
}

/**
 * A camera Row-2 control chip — icon + label pill matching AspectChip /
 * CountdownChip / OrientationChip. State is normally conveyed by the label;
 * `active` paints a themeColor fill for chips that toggle a panel.
 */
export default function CameraChip({
  icon,
  label,
  themeColor,
  active = false,
  accessibilityLabel,
  onPress,
}: CameraChipProps) {
  const fg = active ? readableTextOn(themeColor) : '#fff';

  const handlePress = () => {
    hapticsBridge.selection();
    onPress();
  };

  return (
    <Pressable
      onPress={handlePress}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ selected: active }}
      style={({ pressed }) => [
        styles.chip,
        // rgba scrim sits over the live camera preview — camera-scrim exception.
        {
          backgroundColor: active ? themeColor : CameraChrome.controlFill,
          borderColor: active ? themeColor : CameraChrome.border,
        },
        pressed && { opacity: 0.7 },
      ]}>
      <View style={styles.row}>
        <Ionicons name={icon} size={16} color={fg} />
        <ThemedText variant="caption" style={{ color: fg }}>
          {label}
        </ThemedText>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    height: CameraChrome.controlHeight,
    minWidth: 72,
    paddingHorizontal: 12,
    borderRadius: CameraChrome.pillRadius,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    ...cameraControlShadow,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
});
