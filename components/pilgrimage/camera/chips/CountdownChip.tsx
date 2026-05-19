import { Pressable, StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { ThemedText } from '../../../themed';
import { hapticsBridge } from '../../../../modules/haptics/hapticsBridge';
import { CameraChrome, cameraControlShadow } from '../cameraChrome';
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
      style={({ pressed }) => [styles.chip, pressed && { opacity: 0.7 }]}>
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
