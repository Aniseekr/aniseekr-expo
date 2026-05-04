import { View, Text, Pressable, Platform, StyleSheet } from 'react-native';
import FontAwesome5 from '@expo/vector-icons/FontAwesome5';
import Ionicons from '@expo/vector-icons/Ionicons';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

interface GachaHeaderProps {
  coinBalance: number;
  onShowDropRates: () => void;
  onShowReconstruction: () => void;
}

export function GachaHeader({
  coinBalance,
  onShowDropRates,
  onShowReconstruction,
}: GachaHeaderProps) {
  return (
    <View style={styles.container}>
      <View style={styles.leftSection}>
        <Text style={styles.label}>SIGNAL SCANNER</Text>
        <View style={styles.coinCard}>
          <View style={styles.coinIconContainer}>
            <FontAwesome5 name="coins" size={18} color="#fbbf24" />
          </View>
          <Text style={styles.coinBalance}>{coinBalance}</Text>
          <Pressable style={styles.addButton}>
            <Text style={styles.addButtonText}>+ ADD</Text>
          </Pressable>
        </View>
      </View>
      <View style={styles.actionsRow}>
        <Pressable onPress={onShowDropRates} style={styles.actionButton}>
          <Ionicons name="information-circle-outline" size={24} color="rgba(255,255,255,0.7)" />
        </Pressable>
        <Pressable
          onPress={onShowReconstruction}
          style={[styles.actionButton, styles.reconstructionButton]}>
          <MaterialIcons name="auto-awesome" size={24} color="#06b6d4" />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 32,
    paddingHorizontal: 8,
  },
  leftSection: {
    flex: 1,
  },
  label: {
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 3.2,
    marginBottom: 12,
    marginLeft: 8,
    fontFamily: Platform.select({
      ios: 'System',
      android: 'Roboto',
    }),
  },
  coinCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 28,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    ...Platform.select({
      android: {
        backgroundColor: '#1E1E1E',
        elevation: 2,
      },
    }),
  },
  coinIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(251, 191, 36, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(251, 191, 36, 0.3)',
  },
  coinBalance: {
    color: 'rgba(255, 255, 255, 0.87)',
    fontSize: 24,
    fontWeight: '700',
    letterSpacing: -0.5,
    fontFamily: Platform.select({
      ios: 'System',
      android: 'Roboto',
    }),
  },
  addButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#fbbf24',
    borderRadius: 20,
    ...Platform.select({
      android: {
        elevation: 2,
      },
    }),
  },
  addButtonText: {
    color: '#000',
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    fontFamily: Platform.select({
      ios: 'System',
      android: 'Roboto',
    }),
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  actionButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      android: {
        backgroundColor: '#1E1E1E',
        elevation: 2,
      },
    }),
  },
  reconstructionButton: {
    backgroundColor: 'rgba(6, 182, 212, 0.1)',
    borderColor: 'rgba(6, 182, 212, 0.2)',
  },
});
