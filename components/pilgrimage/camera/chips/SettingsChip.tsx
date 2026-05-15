import { Pressable, StyleSheet } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTheme } from '../../../../context/ThemeContext';
import { hapticsBridge } from '../../../../modules/haptics/hapticsBridge';

interface SettingsChipProps {
  onPress: () => void;
}

// Square 36x36 trigger sitting in the same chip row. hitSlop bumps the
// effective tap area past the 44pt iOS HIG target without enlarging the
// visual footprint (which would crowd the camera preview).
export default function SettingsChip({ onPress }: SettingsChipProps) {
  const { theme } = useTheme();

  const handlePress = () => {
    hapticsBridge.tap();
    onPress();
  };

  return (
    <Pressable
      onPress={handlePress}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel="Camera settings"
      style={({ pressed }) => [
        styles.chip,
        // rgba scrim sits over the live camera preview — no theme surface below.
        { backgroundColor: 'rgba(0,0,0,0.45)', borderColor: theme.glassBorder },
        pressed && { opacity: 0.7 },
      ]}>
      <Ionicons name="settings-outline" size={18} color="#fff" />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    width: 44,
    height: 44,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
