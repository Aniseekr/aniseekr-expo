import { memo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Spacing, Typography } from '../../constants/DesignSystem';
import { useTheme } from '../../context/ThemeContext';
import { hapticsBridge } from '../../modules/haptics/hapticsBridge';

export type DurationKey = 'all' | 'short' | 'standard' | 'long' | 'movie';

interface DurationOption {
  key: DurationKey;
  label: string;
  description: string;
  icon: React.ComponentProps<typeof MaterialIcons>['name'];
  minMinutes?: number;
  maxMinutes?: number;
}

export const DURATION_OPTIONS: DurationOption[] = [
  {
    key: 'all',
    label: 'All Lengths',
    description: 'Any episode duration',
    icon: 'all-inclusive',
  },
  {
    key: 'short',
    label: 'Short Form',
    description: 'Under 13 min',
    icon: 'flash-on',
    maxMinutes: 13,
  },
  {
    key: 'standard',
    label: 'Standard',
    description: '13 to 30 min',
    icon: 'tv',
    minMinutes: 13,
    maxMinutes: 30,
  },
  {
    key: 'long',
    label: 'Long Form',
    description: '30 to 60 min',
    icon: 'access-time-filled',
    minMinutes: 30,
    maxMinutes: 60,
  },
  {
    key: 'movie',
    label: 'Movies',
    description: '60+ min',
    icon: 'movie',
    minMinutes: 60,
  },
];

interface DurationSelectorProps {
  value: DurationKey;
  onChange: (key: DurationKey) => void;
}

function DurationSelectorComponent({ value, onChange }: DurationSelectorProps) {
  const { theme } = useTheme();

  return (
    <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
      {DURATION_OPTIONS.map((option, idx) => {
        const isSelected = option.key === value;
        return (
          <Animated.View key={option.key} entering={FadeInDown.delay(idx * 50).springify()}>
            <Pressable
              onPress={() => {
                hapticsBridge.selection();
                onChange(option.key);
              }}
              style={({ pressed }) => [
                styles.row,
                {
                  backgroundColor: isSelected ? theme.accent + '24' : theme.background.secondary,
                  borderColor: isSelected ? theme.accent : theme.glassBorder,
                  opacity: pressed ? 0.85 : 1,
                },
              ]}>
              <View
                style={[
                  styles.iconWrap,
                  {
                    backgroundColor: isSelected ? theme.accent : theme.background.tertiary,
                  },
                ]}>
                <MaterialIcons
                  name={option.icon}
                  size={20}
                  color={isSelected ? '#0E0A06' : theme.text.primary}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.label, { color: theme.text.primary }]}>{option.label}</Text>
                <Text style={[styles.description, { color: theme.text.secondary }]}>
                  {option.description}
                </Text>
              </View>
              <MaterialIcons
                name={isSelected ? 'check-circle' : 'chevron-right'}
                size={22}
                color={isSelected ? theme.accent : theme.text.tertiary}
              />
            </Pressable>
          </Animated.View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    padding: Spacing.sm + 2,
    borderRadius: 14,
    borderWidth: 1,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    ...Typography.titleMedium,
  },
  description: {
    ...Typography.bodySmall,
    marginTop: 2,
  },
});

export const DurationSelector = memo(DurationSelectorComponent);
