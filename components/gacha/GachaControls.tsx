import { View, Text, Pressable, Platform, StyleSheet } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

interface GachaControlsProps {
  onShowHistory: () => void;
  onShowCollection: () => void;
  onShowRanking: () => void;
}

export function GachaControls({
  onShowHistory,
  onShowCollection,
  onShowRanking,
}: GachaControlsProps) {
  return (
    <View style={styles.container}>
      <View style={styles.controlsRow}>
        <ControlButton
          icon={<Ionicons name="time-outline" size={26} color="rgba(255,255,255,0.9)" />}
          label="History"
          onPress={onShowHistory}
        />
        <View style={styles.divider} />
        <ControlButton
          icon={<MaterialIcons name="collections" size={26} color="rgba(255,255,255,0.9)" />}
          label="Collection"
          onPress={onShowCollection}
        />
        <View style={styles.divider} />
        <ControlButton
          icon={<Ionicons name="stats-chart" size={26} color="rgba(255,255,255,0.9)" />}
          label="Ranking"
          onPress={onShowRanking}
        />
      </View>
    </View>
  );
}

function ControlButton({
  icon,
  label,
  onPress,
}: {
  icon: React.ReactNode;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={styles.button}>
      <View style={styles.iconContainer}>{icon}</View>
      <Text style={styles.label}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 36,
    paddingVertical: 20,
    paddingHorizontal: 24,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    ...Platform.select({
      android: {
        backgroundColor: '#1E1E1E',
        elevation: 4,
      },
    }),
  },
  controlsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  divider: {
    width: 1,
    height: 40,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  button: {
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  iconContainer: {
    marginBottom: 8,
  },
  label: {
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 2,
    fontFamily: Platform.select({
      ios: 'System',
      android: 'Roboto',
    }),
  },
});
