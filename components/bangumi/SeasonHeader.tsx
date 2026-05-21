// Season header for the Bangumi screen.
// Mirrors the iOS layout: a glass capsule containing prev / season label / next,
// followed by an All|Tracking filter pill and a single swipe-mode toggle.

import { memo, useMemo } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { FontFamily, Radius, Spacing, Typography } from '../../constants/DesignSystem';
import { useTheme, type ThemePalette } from '../../context/ThemeContext';
import { readableTextOn } from '../themed';

type FilterMode = 'all' | 'tracking';

type ViewMode = 'calendar' | 'list' | 'cards';

interface SeasonHeaderProps {
  seasonDisplayName: string;
  onPrevSeason: () => void;
  onNextSeason: () => void;
  filterMode: FilterMode;
  onFilterChange: (mode: FilterMode) => void;
  viewMode: ViewMode;
  /** Toggle in/out of the swipe (cards) view. The parent restores the previous
   *  base view (calendar | list) when the user exits. */
  onToggleSwipe: () => void;
  totalCount?: number;
  onLabelTap?: () => void;
  onOpenSettings?: () => void;
}

const FILTER_SEGMENT_WIDTH = 84;

function SeasonHeaderImpl({
  seasonDisplayName,
  onPrevSeason,
  onNextSeason,
  filterMode,
  onFilterChange,
  viewMode,
  onToggleSwipe,
  totalCount,
  onLabelTap,
  onOpenSettings,
}: SeasonHeaderProps) {
  const { theme } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const filterActiveFg = useMemo(() => readableTextOn(theme.accent), [theme.accent]);
  const swipeActive = viewMode === 'cards';
  const swipeFg = useMemo(
    () => (swipeActive ? readableTextOn(theme.accent) : theme.text.primary),
    [swipeActive, theme.accent, theme.text.primary]
  );
  const indicatorX = useSharedValue(filterMode === 'all' ? 0 : FILTER_SEGMENT_WIDTH);
  indicatorX.value = withSpring(filterMode === 'all' ? 0 : FILTER_SEGMENT_WIDTH, {
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
            <MaterialIcons name="chevron-left" size={18} color={theme.text.secondary} />
          </Pressable>
          <View style={styles.capsuleDivider} />
          <Pressable onPress={onLabelTap} disabled={!onLabelTap} style={styles.seasonLabel}>
            <Text style={styles.seasonText}>{seasonDisplayName}</Text>
          </Pressable>
          <View style={styles.capsuleDivider} />
          <Pressable onPress={onNextSeason} style={styles.capsuleButton}>
            <MaterialIcons name="chevron-right" size={18} color={theme.text.secondary} />
          </Pressable>
        </View>
      </View>

      <View style={styles.bottomRow}>
        <View style={styles.filterPill}>
          <Animated.View style={[styles.filterIndicator, indicatorStyle]} />
          {(['all', 'tracking'] as FilterMode[]).map((mode) => {
            const active = filterMode === mode;
            return (
              <Pressable
                key={mode}
                onPress={() => onFilterChange(mode)}
                style={styles.filterButton}>
                <Text
                  style={[
                    styles.filterText,
                    active && { color: filterActiveFg, fontWeight: '700' },
                  ]}>
                  {mode === 'tracking' ? 'Tracking' : 'All'}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.actionGroup}>
          {onOpenSettings ? (
            <Pressable onPress={onOpenSettings} style={styles.viewModeButton}>
              <MaterialIcons name="tune" size={20} color={theme.text.primary} />
            </Pressable>
          ) : null}
          <Pressable
            onPress={onToggleSwipe}
            accessibilityRole="button"
            accessibilityState={{ selected: swipeActive }}
            accessibilityLabel={swipeActive ? 'Exit swipe mode' : 'Enter swipe mode'}
            style={({ pressed }) => [
              styles.swipeToggle,
              swipeActive && { backgroundColor: theme.accent, borderColor: theme.accent },
              pressed && { opacity: 0.85 },
            ]}>
            <MaterialIcons
              name={swipeActive ? 'close' : 'view-carousel'}
              size={20}
              color={swipeFg}
            />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

export const SeasonHeader = memo(SeasonHeaderImpl);

const makeStyles = (theme: ThemePalette) =>
  StyleSheet.create({
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
      color: theme.text.primary,
      fontFamily: FontFamily.rounded,
    },
    subtitle: {
      ...Typography.caption,
      color: theme.text.secondary,
      marginTop: 4,
    },
    capsule: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: theme.background.secondary,
      borderRadius: Radius.md,
      borderWidth: 1,
      borderColor: theme.glassBorder,
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
      backgroundColor: theme.glassBorder,
    },
    seasonLabel: {
      paddingHorizontal: 10,
      paddingVertical: 6,
    },
    seasonText: {
      ...Typography.caption,
      color: theme.text.primary,
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
      backgroundColor: theme.background.secondary,
      borderRadius: Radius.tabBar,
      padding: 4,
      borderWidth: 1,
      borderColor: theme.glassBorder,
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
      backgroundColor: theme.accent,
    },
    filterButton: {
      width: FILTER_SEGMENT_WIDTH,
      paddingVertical: 8,
      alignItems: 'center',
      justifyContent: 'center',
    },
    filterText: {
      ...Typography.titleSmall,
      color: theme.text.secondary,
      fontFamily: FontFamily.rounded,
    },
    viewModeButton: {
      width: 40,
      height: 40,
      borderRadius: Radius.full,
      backgroundColor: theme.background.secondary,
      borderWidth: 1,
      borderColor: theme.glassBorder,
      alignItems: 'center',
      justifyContent: 'center',
      ...Platform.select({
        android: { elevation: 1 },
      }),
    },
    swipeToggle: {
      width: 40,
      height: 40,
      borderRadius: Radius.full,
      backgroundColor: theme.background.secondary,
      borderWidth: 1,
      borderColor: theme.glassBorder,
      alignItems: 'center',
      justifyContent: 'center',
      ...Platform.select({
        android: { elevation: 1 },
      }),
    },
    actionGroup: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.xs,
    },
  });
