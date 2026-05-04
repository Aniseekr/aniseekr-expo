import { memo, useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import Animated, { FadeIn, FadeInUp, FadeOut } from 'react-native-reanimated';
import { Spacing, Typography } from '../../constants/DesignSystem';
import { useTheme } from '../../context/ThemeContext';
import { hapticsBridge } from '../../modules/haptics/hapticsBridge';

export type Season = 'winter' | 'spring' | 'summer' | 'fall';

const SEASONS: { key: Season; label: string; emoji: string; range: string }[] = [
  { key: 'winter', label: 'Winter', emoji: '❄️', range: 'Jan – Mar' },
  { key: 'spring', label: 'Spring', emoji: '🌸', range: 'Apr – Jun' },
  { key: 'summer', label: 'Summer', emoji: '☀️', range: 'Jul – Sep' },
  { key: 'fall', label: 'Fall', emoji: '🍂', range: 'Oct – Dec' },
];

interface RatingSeasonPickerProps {
  visible: boolean;
  year: number;
  season: Season;
  minYear?: number;
  maxYear?: number;
  onClose: () => void;
  onConfirm: (year: number, season: Season) => void;
}

function RatingSeasonPickerComponent({
  visible,
  year,
  season,
  minYear = 1980,
  maxYear = new Date().getFullYear() + 1,
  onClose,
  onConfirm,
}: RatingSeasonPickerProps) {
  const { theme } = useTheme();
  const [selectedYear, setSelectedYear] = useState(year);
  const [selectedSeason, setSelectedSeason] = useState<Season>(season);
  const [view, setView] = useState<'list' | 'grid'>('grid');

  const years = useMemo(() => {
    const list: number[] = [];
    for (let y = maxYear; y >= minYear; y--) list.push(y);
    return list;
  }, [maxYear, minYear]);

  const handleConfirm = () => {
    hapticsBridge.success();
    onConfirm(selectedYear, selectedSeason);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Animated.View
        entering={FadeIn.duration(160)}
        exiting={FadeOut.duration(160)}
        style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <Animated.View
          entering={FadeInUp.springify().damping(18)}
          style={[
            styles.sheet,
            {
              backgroundColor: theme.background.secondary,
              borderColor: theme.glassBorder,
            },
          ]}>
          <SafeAreaView edges={['bottom']}>
            <View style={styles.headerRow}>
              <Text style={[styles.title, { color: theme.text.primary }]}>Pick season</Text>
              <Pressable
                onPress={() => {
                  hapticsBridge.selection();
                  setView(view === 'grid' ? 'list' : 'grid');
                }}
                hitSlop={8}>
                <MaterialIcons
                  name={view === 'grid' ? 'view-list' : 'grid-view'}
                  size={22}
                  color={theme.text.secondary}
                />
              </Pressable>
            </View>

            <Text style={[styles.sectionLabel, { color: theme.text.secondary }]}>Season</Text>
            <View style={styles.seasonRow}>
              {SEASONS.map((s) => {
                const active = s.key === selectedSeason;
                return (
                  <Pressable
                    key={s.key}
                    onPress={() => {
                      hapticsBridge.selection();
                      setSelectedSeason(s.key);
                    }}
                    style={({ pressed }) => [
                      styles.seasonCard,
                      {
                        backgroundColor: active ? theme.accent + '24' : theme.background.tertiary,
                        borderColor: active ? theme.accent : theme.glassBorder,
                        opacity: pressed ? 0.85 : 1,
                      },
                    ]}>
                    <Text style={styles.seasonEmoji}>{s.emoji}</Text>
                    <Text
                      style={[
                        styles.seasonLabel,
                        {
                          color: active ? theme.accent : theme.text.primary,
                        },
                      ]}>
                      {s.label}
                    </Text>
                    <Text style={[styles.seasonRange, { color: theme.text.tertiary }]}>
                      {s.range}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={[styles.sectionLabel, { color: theme.text.secondary }]}>Year</Text>
            {view === 'grid' ? (
              <ScrollView style={{ maxHeight: 240 }}>
                <View style={styles.yearGrid}>
                  {years.map((y) => {
                    const active = y === selectedYear;
                    return (
                      <Pressable
                        key={y}
                        onPress={() => {
                          hapticsBridge.selection();
                          setSelectedYear(y);
                        }}
                        style={({ pressed }) => [
                          styles.yearChip,
                          {
                            backgroundColor: active ? theme.accent : theme.background.tertiary,
                            borderColor: active ? theme.accent : theme.glassBorder,
                            opacity: pressed ? 0.85 : 1,
                          },
                        ]}>
                        <Text
                          style={[
                            styles.yearLabel,
                            { color: active ? '#0E0A06' : theme.text.primary },
                          ]}>
                          {y}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </ScrollView>
            ) : (
              <ScrollView style={{ maxHeight: 240 }}>
                {years.map((y) => {
                  const active = y === selectedYear;
                  return (
                    <Pressable
                      key={y}
                      onPress={() => {
                        hapticsBridge.selection();
                        setSelectedYear(y);
                      }}
                      style={({ pressed }) => [
                        styles.yearRow,
                        {
                          backgroundColor: active ? theme.accent + '20' : 'transparent',
                          opacity: pressed ? 0.7 : 1,
                        },
                      ]}>
                      <Text style={[styles.yearRowLabel, { color: theme.text.primary }]}>{y}</Text>
                      {active ? (
                        <MaterialIcons name="check" size={20} color={theme.accent} />
                      ) : null}
                    </Pressable>
                  );
                })}
              </ScrollView>
            )}

            <View style={styles.footerRow}>
              <Pressable
                onPress={onClose}
                style={({ pressed }) => [
                  styles.footerButton,
                  styles.cancelButton,
                  {
                    borderColor: theme.glassBorder,
                    opacity: pressed ? 0.7 : 1,
                  },
                ]}>
                <Text style={[styles.footerLabel, { color: theme.text.secondary }]}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={handleConfirm}
                style={({ pressed }) => [
                  styles.footerButton,
                  { backgroundColor: theme.accent, opacity: pressed ? 0.85 : 1 },
                ]}>
                <Text style={styles.confirmLabel}>
                  Confirm {SEASONS.find((s) => s.key === selectedSeason)?.label} {selectedYear}
                </Text>
              </Pressable>
            </View>
          </SafeAreaView>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderTopWidth: 1,
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.md,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  title: {
    ...Typography.headlineSmall,
  },
  sectionLabel: {
    ...Typography.captionSmall,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: Spacing.xs,
    marginTop: Spacing.sm,
  },
  seasonRow: {
    flexDirection: 'row',
    gap: Spacing.xs,
  },
  seasonCard: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    borderRadius: 14,
    borderWidth: 1,
  },
  seasonEmoji: {
    fontSize: 22,
    marginBottom: 4,
  },
  seasonLabel: {
    ...Typography.titleSmall,
    fontWeight: '700',
  },
  seasonRange: {
    ...Typography.captionSmall,
    marginTop: 2,
  },
  yearGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingVertical: Spacing.xs,
  },
  yearChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
  },
  yearLabel: {
    ...Typography.titleSmall,
    fontWeight: '600',
  },
  yearRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.sm,
    paddingVertical: 12,
    borderRadius: 10,
  },
  yearRowLabel: {
    ...Typography.titleMedium,
  },
  footerRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: Spacing.md,
  },
  footerButton: {
    flex: 1,
    paddingVertical: Spacing.sm + 2,
    borderRadius: 14,
    alignItems: 'center',
  },
  cancelButton: {
    borderWidth: 1,
  },
  footerLabel: {
    ...Typography.titleMedium,
  },
  confirmLabel: {
    ...Typography.titleMedium,
    color: '#0E0A06',
    fontWeight: '700',
  },
});

export const RatingSeasonPicker = memo(RatingSeasonPickerComponent);
