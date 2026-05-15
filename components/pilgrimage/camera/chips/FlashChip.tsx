import { Pressable, StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { ThemedText } from '../../../themed';
import { useTheme } from '../../../../context/ThemeContext';
import { hapticsBridge } from '../../../../modules/haptics/hapticsBridge';
import type { FlashMode } from '../types';

interface FlashChipProps {
  flashMode: FlashMode;
  isFrontFacing?: boolean;
  onChange: (next: FlashMode) => void;
}

const FULL_CYCLE: FlashMode[] = ['off', 'auto', 'on', 'torch'];
const FRONT_CYCLE: FlashMode[] = ['off', 'auto', 'on'];

const ICON: Record<FlashMode, keyof typeof Ionicons.glyphMap> = {
  off: 'flash-off-outline',
  auto: 'flash-outline',
  on: 'flash',
  torch: 'flashlight',
};

const LABEL: Record<FlashMode, string> = {
  off: 'OFF',
  auto: 'AUTO',
  on: 'ON',
  torch: 'TORCH',
};

export default function FlashChip({ flashMode, isFrontFacing = false, onChange }: FlashChipProps) {
  const { theme } = useTheme();
  const cycle = isFrontFacing ? FRONT_CYCLE : FULL_CYCLE;

  const handlePress = () => {
    const idx = cycle.indexOf(flashMode);
    const next = cycle[(idx === -1 ? 0 : idx + 1) % cycle.length];
    hapticsBridge.selection();
    onChange(next);
  };

  return (
    <Pressable
      onPress={handlePress}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={`Flash ${LABEL[flashMode]}`}
      style={({ pressed }) => [
        styles.chip,
        // rgba scrim sits over the live camera preview — no theme surface below.
        { backgroundColor: 'rgba(0,0,0,0.45)', borderColor: theme.glassBorder },
        pressed && { opacity: 0.7 },
      ]}>
      <View style={styles.row}>
        <Ionicons name={ICON[flashMode]} size={16} color="#fff" />
        <ThemedText variant="caption" style={styles.label}>
          {LABEL[flashMode]}
        </ThemedText>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    height: 44,
    minWidth: 76,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 22,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  label: {
    color: '#fff',
  },
});
