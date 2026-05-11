import { StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../../../context/ThemeContext';
import { Radius, Spacing, Typography } from '../../../constants/DesignSystem';
import { ThemedText, readableTextOn } from '../../themed';

interface HeroValue {
  label: string;
  value: string;
  hidden?: boolean;
}

interface Props {
  badge?: string;
  highlight?: string;
  values: HeroValue[];
}

export function StatsHeroCard({ badge, highlight, values }: Props) {
  const { theme } = useTheme();
  const onAccent = readableTextOn(theme.accent);

  return (
    <LinearGradient
      colors={[`${theme.accent}33`, `${theme.background.secondary}E6`]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.card, { borderColor: theme.glassBorder }]}
    >
      <View style={styles.headerRow}>
        {badge ? (
          <ThemedText
            variant="captionSmall"
            tone="secondary"
            weight="700"
            style={[styles.badge, { letterSpacing: 2 }]}
          >
            {badge}
          </ThemedText>
        ) : (
          <View />
        )}
        {highlight ? (
          <View style={[styles.highlight, { backgroundColor: theme.accent }]}>
            <ThemedText
              variant="captionSmall"
              weight="700"
              style={[styles.highlightText, { color: onAccent }]}
            >
              {highlight}
            </ThemedText>
          </View>
        ) : null}
      </View>
      <View style={styles.valueRow}>
        {values
          .filter((v) => !v.hidden)
          .map((v) => (
            <View key={v.label} style={styles.valueCol}>
              <ThemedText
                style={[styles.value, { color: theme.text.primary }]}
              >
                {v.value}
              </ThemedText>
              <ThemedText variant="captionSmall" tone="tertiary" style={styles.valueLabel}>
                {v.label}
              </ThemedText>
            </View>
          ))}
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: Radius.cardLg,
    borderWidth: 1,
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  badge: {
    textTransform: 'uppercase',
  },
  highlight: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: Radius.full,
  },
  highlightText: {
    letterSpacing: 0.5,
  },
  valueRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  valueCol: {
    flex: 1,
    gap: 2,
  },
  value: {
    ...Typography.displayLarge,
    fontWeight: '800',
  },
  valueLabel: {
    textTransform: 'capitalize',
  },
});
