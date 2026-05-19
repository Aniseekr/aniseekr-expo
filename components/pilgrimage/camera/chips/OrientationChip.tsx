import { Pressable, StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { ThemedText } from '../../../themed';
import { hapticsBridge } from '../../../../modules/haptics/hapticsBridge';
import { CameraChrome, cameraControlShadow } from '../cameraChrome';
import type { CameraOrientationMode } from '../../../../libs/services/pilgrimage/camera-ui';

interface OrientationChipProps {
  mode: CameraOrientationMode;
  onChange: (next: CameraOrientationMode) => void;
}

const LABEL: Record<CameraOrientationMode, string> = {
  auto: 'AUTO',
  landscape: 'LAND',
};

const ICON: Record<CameraOrientationMode, keyof typeof Ionicons.glyphMap> = {
  auto: 'phone-portrait-outline',
  landscape: 'phone-landscape-outline',
};

export default function OrientationChip({ mode, onChange }: OrientationChipProps) {
  const handlePress = () => {
    hapticsBridge.selection();
    onChange(mode === 'landscape' ? 'auto' : 'landscape');
  };

  return (
    <Pressable
      onPress={handlePress}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={`Orientation ${LABEL[mode]}`}
      accessibilityState={{ selected: mode === 'landscape' }}
      style={({ pressed }) => [styles.chip, pressed && { opacity: 0.7 }]}>
      <View style={styles.row}>
        <Ionicons name={ICON[mode]} size={16} color="#fff" />
        <ThemedText variant="caption" style={styles.label}>
          {LABEL[mode]}
        </ThemedText>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // rgba scrim sits over the live camera preview — camera-scrim exception.
  chip: {
    height: CameraChrome.controlHeight,
    minWidth: 72,
    paddingHorizontal: 12,
    borderRadius: CameraChrome.pillRadius,
    borderWidth: 1,
    borderColor: CameraChrome.border,
    backgroundColor: CameraChrome.controlFill,
    alignItems: 'center',
    justifyContent: 'center',
    ...cameraControlShadow,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  label: { color: '#fff' },
});
