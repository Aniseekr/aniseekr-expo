// Season header for the Bangumi screen.
// Mirrors the iOS layout: a glass capsule containing prev / season label / next,
// followed by a Tracking|All filter pill and a calendar/list toggle button.

import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Colors, FontFamily, Radius, Spacing, Typography } from '../../constants/DesignSystem';

type FilterMode = 'all' | 'tracking';

interface SeasonHeaderProps {
  seasonDisplayName: string;
  onPrevSeason: () => void;
  onNextSeason: () => void;
  filterMode: FilterMode;
  onFilterChange: (mode: FilterMode) => void;
  viewMode: 'calendar' | 'list';
  onViewModeToggle: () => void;
  totalCount?: number;
  onLabelTap?: () => void;
  onOpenSettings?: () => void;
}

const FILTER_SEGMENT_WIDTH = 84;

export function SeasonHeader({
  seasonDisplayName,
  onPrevSeason,
  onNextSeason,
  filterMode,
  onFilterChange,
  viewMode,
  onViewModeToggle,
  totalCount,
  onLabelTap,
  onOpenSettings,
}: SeasonHeaderProps) {
  const indicatorX = useSharedValue(filterMode === 'tracking' ? 0 : FILTER_SEGMENT_WIDTH);
  indicatorX.value = withSpring(filterMode === 'tracking' ? 0 : FILTER_SEGMENT_WIDTH, {
    damping: 18,
    stiffness: 220,
  });

  const indicatorStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: indicatorX.value }],
  }));

  return (
    <View style={styles.container}>
      <View style={styles.topRow}>
        <View>
          <Text style={styles.title}>Bangumi</Text>
          <Text style={styles.subtitle}>
            {totalCount !== undefined ? `${totalCount} series` : 'Weekly Schedule'}
          </Text>
        </View>

        {/* Capsule season selector */}
        <View style={styles.capsule}>
          <Pressable onPress={onPrevSeason} style={styles.capsuleButton}>
            <MaterialIcons name="chevron-left" size={18} color={Colors.text.secondary} />
          </Pressable>
          <View style={styles.capsuleDivider} />
          <Pressable onPress={onLabelTap} disabled={!onLabelTap} style={styles.seasonLabel}>
            <Text style={styles.seasonText}>{seasonDisplayName}</Text>
          </Pressable>
          <View style={styles.capsuleDivider} />
          <Pressable onPress={onNextSeason} style={styles.capsuleButton}>
            <MaterialIcons name="chevron-right" size={18} color={Colors.text.secondary} />
          </Pressable>
        </View>
      </View>

      <View style={styles.bottomRow}>
        <View style={styles.filterPill}>
          <Animated.View style={[styles.filterIndicator, indicatorStyle]} />
          {(['tracking', 'all'] as FilterMode[]).map((mode) => {
            const active = filterMode === mode;
            return (
              <Pressable
                key={mode}
                onPress={() => onFilterChange(mode)}
                style={styles.filterButton}>
                <Text style={[styles.filterText, active && styles.filterTextActive]}>
                  {mode === 'tracking' ? 'Tracking' : 'All'}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.actionGroup}>
          {onOpenSettings ? (
            <Pressable onPress={onOpenSettings} style={styles.viewModeButton}>
              <MaterialIcons name="tune" size={20} color={Colors.text.primary} />
            </Pressable>
          ) : null}
          <Pressable onPress={onViewModeToggle} style={styles.viewModeButton}>
            <MaterialIcons
              name={viewMode === 'calendar' ? 'view-list' : 'calendar-today'}
              size={20}
              color={Colors.text.primary}
            />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.md,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.sm,
  },
  title: {
    ...Typography.headlineLarge,
    color: Colors.text.primary,
    fontFamily: FontFamily.rounded,
  },
  subtitle: {
    ...Typography.bodySmall,
    color: Colors.text.secondary,
    marginTop: 2,
  },
  capsule: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.glass.medium,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.glass.border,
    overflow: 'hidden',
  },
  capsuleButton: {
    paddingHorizontal: 8,
    paddingVertical: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  capsuleDivider: {
    width: 1,
    height: 16,
    backgroundColor: Colors.glass.border,
  },
  seasonLabel: {
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  seasonText: {
    ...Typography.titleSmall,
    color: Colors.text.primary,
    fontFamily: FontFamily.rounded,
  },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.sm,
  },
  filterPill: {
    flexDirection: 'row',
    backgroundColor: Colors.glass.dark,
    borderRadius: Radius.tabBar,
    padding: 4,
    borderWidth: 1,
    borderColor: Colors.glass.border,
    width: FILTER_SEGMENT_WIDTH * 2 + 8,
    position: 'relative',
  },
  filterIndicator: {
    position: 'absolute',
    top: 4,
    bottom: 4,
    left: 4,
    width: FILTER_SEGMENT_WIDTH,
    borderRadius: Radius.tabActive,
    backgroundColor: Colors.primary,
  },
  filterButton: {
    width: FILTER_SEGMENT_WIDTH,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterText: {
    ...Typography.titleSmall,
    color: Colors.text.secondary,
    fontFamily: FontFamily.rounded,
  },
  filterTextActive: {
    color: '#0A0A0A',
    fontWeight: '700',
  },
  viewModeButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.glass.medium,
    borderWidth: 1,
    borderColor: Colors.glass.border,
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      android: { elevation: 1 },
    }),
  },
  actionGroup: {
    flexDirection: 'row',
    gap: Spacing.xs,
  },
});
