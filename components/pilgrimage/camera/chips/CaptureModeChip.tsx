import { Pressable, StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { ThemedText } from '../../../themed';
import { useTheme } from '../../../../context/ThemeContext';
import { hapticsBridge } from '../../../../modules/haptics/hapticsBridge';
import type { CaptureMode } from '../../../../hooks/useCameraSettings';

interface CaptureModeChipProps {
  mode: CaptureMode;
  onChange: (next: CaptureMode) => void;
}

const CYCLE: CaptureMode[] = ['single', 'burst', 'hdr'];

const ICON: Record<CaptureMode, keyof typeof Ionicons.glyphMap> = {
  single: 'camera-outline',
  burst: 'copy-outline',
  hdr: 'contrast-outline',
};

const LABEL: Record<CaptureMode, string> = {
  single: 'SINGLE',
  burst: 'BURST',
  hdr: 'HDR',
};

export default function CaptureModeChip({ mode, onChange }: CaptureModeChipProps) {
  const { theme } = useTheme();

  const handlePress = () => {
    const idx = CYCLE.indexOf(mode);
    const next = CYCLE[(idx === -1 ? 0 : idx + 1) % CYCLE.length];
    hapticsBridge.selection();
    onChange(next);
  };

  return (
    <Pressable
      onPress={handlePress}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={`Capture mode ${LABEL[mode]}`}
      style={({ pressed }) => [
        styles.chip,
        // rgba scrim sits over the live camera preview — no theme surface below.
        { backgroundColor: 'rgba(0,0,0,0.45)', borderColor: theme.glassBorder },
        pressed && { opacity: 0.7 },
      ]}>
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
