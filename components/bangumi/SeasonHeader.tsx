import { View, Text, Pressable, Platform, StyleSheet } from 'react-native';
import { GlassCard } from '../common/GlassCard';
import Ionicons from '@expo/vector-icons/Ionicons';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

type Season = 'winter' | 'spring' | 'summer' | 'fall';
type FilterMode = 'all' | 'tracking';

interface SeasonHeaderProps {
  seasonDisplayName: string;
  onPrevSeason: () => void;
  onNextSeason: () => void;
  filterMode: FilterMode;
  onFilterChange: (mode: FilterMode) => void;
  viewMode: 'calendar' | 'list';
  onViewModeToggle: () => void;
}

export function SeasonHeader({ 
  seasonDisplayName, 
  onPrevSeason, 
  onNextSeason, 
  filterMode, 
  onFilterChange,
  viewMode,
  onViewModeToggle 
}: SeasonHeaderProps) {
  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Weekly Schedule</Text>
        <View className="flex-row items-center gap-3">
          <Pressable
            onPress={onPrevSeason}
            style={styles.navButton}
          >
            <MaterialIcons name="chevron-left" size={24} color="rgba(255, 255, 255, 0.87)" />
          </Pressable>
          <View style={styles.seasonBadge}>
            <Text style={styles.seasonText}>{seasonDisplayName}</Text>
          </View>
          <Pressable
            onPress={onNextSeason}
            style={styles.navButton}
          >
            <MaterialIcons name="chevron-right" size={24} color="rgba(255, 255, 255, 0.87)" />
          </Pressable>
        </View>
      </View>
      <View className="flex-row items-center justify-between mt-4">
        <View style={styles.filterContainer}>
          <Pressable
            onPress={() => onFilterChange('tracking')}
            style={[
              styles.filterButton,
              filterMode === 'tracking' && styles.filterButtonActive
            ]}
          >
            <Text style={[
              styles.filterText,
              filterMode === 'tracking' && styles.filterTextActive
            ]}>
              Tracking
            </Text>
          </Pressable>
          <Pressable
            onPress={() => onFilterChange('all')}
            style={[
              styles.filterButton,
              filterMode === 'all' && styles.filterButtonActive
            ]}
          >
            <Text style={[
              styles.filterText,
              filterMode === 'all' && styles.filterTextActive
            ]}>
              All
            </Text>
          </Pressable>
        </View>
        <Pressable 
          onPress={onViewModeToggle} 
          style={styles.viewModeButton}
        >
          <MaterialIcons 
            name={viewMode === 'calendar' ? 'view-list' : 'calendar-today'} 
            size={20} 
            color="rgba(255, 255, 255, 0.87)" 
          />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 16,
    padding: 20,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
      },
      android: {
        backgroundColor: '#1E1E1E',
        elevation: 2,
      },
    }),
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    color: 'rgba(255, 255, 255, 0.87)',
    fontSize: 24,
    fontWeight: '700',
    letterSpacing: -0.5,
    fontFamily: Platform.select({
      ios: 'System',
      android: 'Roboto',
    }),
  },
  navButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      android: {
        elevation: 1,
      },
    }),
  },
  seasonBadge: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: 'rgba(98, 0, 238, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(98, 0, 238, 0.3)',
    borderRadius: 20,
  },
  seasonText: {
    color: 'rgba(255, 255, 255, 0.87)',
    fontSize: 14,
    fontWeight: '600',
    fontFamily: Platform.select({
      ios: 'System',
      android: 'Roboto',
    }),
  },
  filterContainer: {
    flexDirection: 'row',
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    borderRadius: 24,
    padding: 4,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    width: 180,
  },
  filterButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterButtonActive: {
    backgroundColor: 'rgba(98, 0, 238, 0.2)',
  },
  filterText: {
    color: 'rgba(255, 255, 255, 0.4)',
    fontSize: 13,
    fontWeight: '600',
    fontFamily: Platform.select({
      ios: 'System',
      android: 'Roboto',
    }),
  },
  filterTextActive: {
    color: 'rgba(255, 255, 255, 0.87)',
  },
  viewModeButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      android: {
        elevation: 1,
      },
    }),
  },
});
