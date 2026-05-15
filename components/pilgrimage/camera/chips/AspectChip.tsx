import { Pressable, StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { ThemedText } from '../../../themed';
import { useTheme } from '../../../../context/ThemeContext';
import { hapticsBridge } from '../../../../modules/haptics/hapticsBridge';
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
  const { theme } = useTheme();

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
      style={({ pressed }) => [
        styles.chip,
        // rgba scrim sits over the live camera preview — no theme surface below.
        { backgroundColor: 'rgba(0,0,0,0.45)', borderColor: theme.glassBorder },
        pressed && { opacity: 0.7 },
      ]}>
      <View style={styles.row}>
        <Ionicons name="square-outline" size={16} color="#fff" />
        <ThemedText variant="caption" style={styles.label}>
          {LABEL[aspect]}
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
