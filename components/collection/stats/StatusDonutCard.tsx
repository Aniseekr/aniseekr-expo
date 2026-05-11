import { StyleSheet, View } from 'react-native';
import { PieChart } from 'react-native-gifted-charts';
import { useTheme } from '../../../context/ThemeContext';
import { Radius, Spacing } from '../../../constants/DesignSystem';
import { ThemedText } from '../../themed';

export interface DonutSlice {
  label: string;
  value: number;
  color: string;
}

interface Props {
  title?: string;
  slices: DonutSlice[];
  total?: number;
  centerLabel?: string;
}

export function StatusDonutCard({ title = 'By Status', slices, total, centerLabel }: Props) {
  const { theme } = useTheme();
  const data = slices.filter((s) => s.value > 0);
  const sumValue = total ?? data.reduce((acc, s) => acc + s.value, 0);

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: theme.background.secondary,
          borderColor: theme.glassBorder,
        },
      ]}>
      <ThemedText variant="titleMedium" weight="700">
        {title}
      </ThemedText>
      <View style={styles.body}>
        {data.length === 0 ? (
          <ThemedText variant="bodySmall" tone="tertiary">
            No data yet
          </ThemedText>
        ) : (
          <>
            <PieChart
              data={data.map((s) => ({ value: s.value, color: s.color }))}
              radius={56}
              innerRadius={36}
              donut
              showTooltip={false}
              centerLabelComponent={() => (
                <View style={styles.center}>
                  <ThemedText variant="titleLarge" weight="800">
                    {sumValue}
                  </ThemedText>
                  <ThemedText variant="captionSmall" tone="tertiary">
                    {centerLabel ?? 'total'}
                  </ThemedText>
                </View>
              )}
            />
            <View style={styles.legend}>
              {data.map((s) => (
                <View key={s.label} style={styles.legendRow}>
                  <View style={[styles.dot, { backgroundColor: s.color }]} />
                  <ThemedText variant="bodySmall" tone="secondary" style={{ flex: 1 }}>
                    {s.label}
                  </ThemedText>
                  <ThemedText variant="titleSmall" weight="700">
                    {s.value}
                  </ThemedText>
                </View>
              ))}
            </View>
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: Radius.card,
    borderWidth: 1,
    padding: Spacing.md,
    gap: Spacing.md,
  },
  body: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  center: {
    alignItems: 'center',
  },
  legend: {
    flex: 1,
    gap: 6,
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
});
