import { Pressable, StyleSheet, View } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useTheme } from '../../../context/ThemeContext';
import { Radius, Spacing } from '../../../constants/DesignSystem';
import { ThemedText } from '../../themed';
import type { AchievementWithProgress } from '../../../libs/services/achievements/achievement-service';
import { hapticsBridge } from '../../../modules/haptics/hapticsBridge';

interface Props {
  achievements: AchievementWithProgress[];
  title?: string;
  maxItems?: number;
  onPressViewAll?: () => void;
}

export function AchievementsGrid({
  achievements,
  title = 'Achievements',
  maxItems = 6,
  onPressViewAll,
}: Props) {
  const { theme } = useTheme();
  const unlockedCount = achievements.filter((a) => a.unlocked).length;
  const shown = achievements.slice(0, maxItems);

  return (
    <View style={styles.section}>
      <View style={styles.headerRow}>
        <ThemedText variant="titleLarge" weight="700">
          {title}
        </ThemedText>
        <Pressable
          onPress={() => {
            if (onPressViewAll) {
              hapticsBridge.tap();
              onPressViewAll();
            }
          }}
          hitSlop={8}
        >
          <ThemedText variant="captionSmall" tone="secondary" weight="600">
            {unlockedCount} / {achievements.length}
          </ThemedText>
        </Pressable>
      </View>
      <View style={styles.grid}>
        {shown.map((a) => (
          <View
            key={a.id}
            style={[
              styles.tile,
              {
                backgroundColor: theme.background.secondary,
                borderColor: a.unlocked ? `${theme.accent}66` : theme.glassBorder,
              },
            ]}>
            <View
              style={[
                styles.iconWrap,
                {
                  backgroundColor: a.unlocked
                    ? `${theme.accent}26`
                    : `${theme.text.tertiary}1A`,
                },
              ]}>
              <MaterialIcons
                name={(a.icon as React.ComponentProps<typeof MaterialIcons>['name']) || 'star'}
                size={20}
                color={a.unlocked ? theme.accent : theme.text.tertiary}
              />
            </View>
            <ThemedText
              variant="bodySmall"
              weight="700"
              tone={a.unlocked ? 'primary' : 'tertiary'}
              align="center"
              numberOfLines={1}
            >
              {a.title}
            </ThemedText>
            <ThemedText variant="captionSmall" tone="tertiary" align="center" numberOfLines={1}>
              {a.unlocked ? 'Unlocked' : `${a.progress} / ${a.target}`}
            </ThemedText>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: Spacing.sm,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  tile: {
    width: '31%',
    minHeight: 96,
    borderRadius: Radius.lg,
    borderWidth: 1,
    padding: Spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
