import { StyleSheet, View } from 'react-native';
import { useTheme } from '../../../context/ThemeContext';
import { Radius, Spacing, Typography } from '../../../constants/DesignSystem';
import { ThemedText } from '../../themed';
import { MonthlyHourBucket } from '../../../libs/services/collection/stats-service';

interface Props {
  data: MonthlyHourBucket[];
  title?: string;
  year?: number;
}

export function MonthlyHoursBar({ data, title = 'Monthly hrs', year }: Props) {
  const { theme } = useTheme();
  const max = Math.max(1, ...data.map((b) => b.hours));
  const peakMonth = data.findIndex((b) => b.hours === max);

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: theme.background.secondary,
          borderColor: theme.glassBorder,
        },
      ]}>
      <View style={styles.headerRow}>
        <ThemedText variant="titleMedium" weight="700">
          {title}
        </ThemedText>
        {year ? (
          <ThemedText variant="captionSmall" tone="tertiary">
            {year}
          </ThemedText>
        ) : null}
      </View>
      <View style={styles.barsRow}>
        {data.map((bucket, i) => {
          const h = (bucket.hours / max) * 100;
          const isPeak = i === peakMonth && bucket.hours > 0;
          return (
            <View key={bucket.monthIndex} style={styles.barCol}>
              <View style={styles.barTrack}>
                <View
                  style={[
                    styles.bar,
                    {
                      height: `${Math.max(4, h)}%`,
                      backgroundColor: isPeak ? theme.accent : `${theme.text.tertiary}66`,
                    },
                  ]}
                />
              </View>
              <ThemedText
                variant="captionSmall"
                tone={isPeak ? 'primary' : 'tertiary'}
                style={styles.barLabel}
              >
                {bucket.label}
              </ThemedText>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: Radius.card,
    borderWidth: 1,
    padding: Spacing.md,
    gap: Spacing.sm,
    minHeight: 180,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  barsRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    height: 100,
    gap: 4,
  },
  barCol: {
    flex: 1,
    alignItems: 'center',
    height: '100%',
    justifyContent: 'flex-end',
    gap: 6,
  },
  barTrack: {
    width: '100%',
    height: 80,
    justifyContent: 'flex-end',
  },
  bar: {
    width: '100%',
    borderRadius: 4,
    minHeight: 4,
  },
  barLabel: {
    ...Typography.captionSmall,
    fontSize: 10,
  },
});
