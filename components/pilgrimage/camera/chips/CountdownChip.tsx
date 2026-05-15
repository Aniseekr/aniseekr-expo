import { Pressable, StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { ThemedText } from '../../../themed';
import { useTheme } from '../../../../context/ThemeContext';
import { hapticsBridge } from '../../../../modules/haptics/hapticsBridge';
import type { CountdownSeconds } from '../../../../hooks/useCameraSettings';

interface CountdownChipProps {
  seconds: CountdownSeconds;
  onChange: (next: CountdownSeconds) => void;
}

const CYCLE: CountdownSeconds[] = [0, 3, 5, 10];

const LABEL: Record<CountdownSeconds, string> = {
  0: 'OFF',
  3: '3s',
  5: '5s',
  10: '10s',
};

export default function CountdownChip({ seconds, onChange }: CountdownChipProps) {
  const { theme } = useTheme();

  const handlePress = () => {
    const idx = CYCLE.indexOf(seconds);
    const next = CYCLE[(idx === -1 ? 0 : idx + 1) % CYCLE.length];
    hapticsBridge.selection();
    onChange(next);
  };

  return (
    <Pressable
      onPress={handlePress}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={`Self-timer ${LABEL[seconds]}`}
      style={({ pressed }) => [
        styles.chip,
        // rgba scrim sits over the live camera preview — no theme surface below.
        { backgroundColor: 'rgba(0,0,0,0.45)', borderColor: theme.glassBorder },
        pressed && { opacity: 0.7 },
      ]}>
      <View style={styles.row}>
        <Ionicons name="timer-outline" size={16} color="#fff" />
        <ThemedText variant="caption" style={styles.label}>
          {LABEL[seconds]}
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
