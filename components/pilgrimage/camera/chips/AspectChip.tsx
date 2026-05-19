import { Pressable, StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { ThemedText } from '../../../themed';
import { hapticsBridge } from '../../../../modules/haptics/hapticsBridge';
import { CameraChrome, cameraControlShadow } from '../cameraChrome';
import type { AspectRatio } from '../types';

interface AspectChipProps {
  aspect: AspectRatio;
  onChange: (next: AspectRatio) => void;
}

const CYCLE: AspectRatio[] = ['16:9', '4:3', '1:1', 'full'];

const LABEL: Record<AspectRatio, string> = {
  '16:9': '16:9',
  '4:3': '4:3',
  '1:1': '1:1',
  full: 'FULL',
};

export default function AspectChip({ aspect, onChange }: AspectChipProps) {
  const handlePress = () => {
    const idx = CYCLE.indexOf(aspect);
    const next = CYCLE[(idx === -1 ? 0 : idx + 1) % CYCLE.length];
    hapticsBridge.selection();
    onChange(next);
  };

  return (
    <Pressable
      onPress={handlePress}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={`Aspect ratio ${LABEL[aspect]}`}
      style={({ pressed }) => [styles.chip, pressed && { opacity: 0.7 }]}>
      <View style={styles.row}>
        <Ionicons name="crop-outline" size={16} color="#fff" />
        <ThemedText variant="caption" style={styles.label}>
          {LABEL[aspect]}
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
