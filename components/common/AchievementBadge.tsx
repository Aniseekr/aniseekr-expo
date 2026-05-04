import { memo } from 'react';
import { StyleSheet, Text, View, ViewStyle } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { LinearGradient } from 'expo-linear-gradient';
import { Spacing, Typography } from '../../constants/DesignSystem';
import { useTheme } from '../../context/ThemeContext';

type IconName = React.ComponentProps<typeof MaterialIcons>['name'];

interface AchievementBadgeProps {
  icon?: IconName;
  title: string;
  subtitle?: string;
  unlocked: boolean;
  size?: number;
  style?: ViewStyle;
}

function AchievementBadgeComponent({
  icon = 'emoji-events',
  title,
  subtitle,
  unlocked,
  size = 80,
  style,
}: AchievementBadgeProps) {
  const { theme } = useTheme();

  return (
    <View style={[styles.container, style]}>
      <View style={[styles.badgeWrap, { width: size, height: size }]}>
        {unlocked ? (
          <LinearGradient
            colors={[theme.accent, theme.accentDark] as [string, string]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[styles.badge, { borderRadius: size / 2 }]}>
            <MaterialIcons name={icon} size={size * 0.5} color="#fff" />
          </LinearGradient>
        ) : (
          <View
            style={[
              styles.badge,
              styles.locked,
              { borderRadius: size / 2, borderColor: theme.glassBorder },
            ]}>
            <MaterialIcons name="lock" size={size * 0.4} color={theme.text.tertiary} />
          </View>
        )}
      </View>
      <Text
        style={[styles.title, { color: unlocked ? theme.text.primary : theme.text.secondary }]}
        numberOfLines={1}>
        {title}
      </Text>
      {subtitle ? (
        <Text style={[styles.subtitle, { color: theme.text.tertiary }]} numberOfLines={2}>
          {subtitle}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    width: 110,
    paddingVertical: Spacing.xs,
  },
  badgeWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.xs,
  },
  badge: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  locked: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
  },
  title: {
    ...Typography.titleSmall,
    textAlign: 'center',
  },
  subtitle: {
    ...Typography.captionSmall,
    textAlign: 'center',
    marginTop: 2,
  },
});

export const AchievementBadge = memo(AchievementBadgeComponent);
