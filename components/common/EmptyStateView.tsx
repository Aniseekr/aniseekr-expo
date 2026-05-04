import { memo, ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, ViewStyle } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Colors, Spacing, Typography } from '../../constants/DesignSystem';
import { hapticsBridge } from '../../modules/haptics/hapticsBridge';
import { useTheme } from '../../context/ThemeContext';

type IconName = React.ComponentProps<typeof MaterialIcons>['name'];

interface EmptyStateViewProps {
  icon?: IconName;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  secondaryActionLabel?: string;
  onSecondaryAction?: () => void;
  style?: ViewStyle;
  iconNode?: ReactNode;
}

function EmptyStateViewComponent({
  icon = 'inbox',
  title,
  description,
  actionLabel,
  onAction,
  secondaryActionLabel,
  onSecondaryAction,
  style,
  iconNode,
}: EmptyStateViewProps) {
  const { theme } = useTheme();

  const handleAction = () => {
    hapticsBridge.tap();
    onAction?.();
  };

  const handleSecondary = () => {
    hapticsBridge.selection();
    onSecondaryAction?.();
  };

  return (
    <View style={[styles.container, style]}>
      <View style={[styles.iconCircle, { backgroundColor: theme.background.secondary }]}>
        {iconNode ?? <MaterialIcons name={icon} size={36} color={theme.accent} />}
      </View>
      <Text style={[styles.title, { color: theme.text.primary }]}>{title}</Text>
      {description ? (
        <Text style={[styles.description, { color: theme.text.secondary }]}>{description}</Text>
      ) : null}
      {actionLabel && onAction ? (
        <Pressable
          onPress={handleAction}
          style={({ pressed }) => [
            styles.button,
            { backgroundColor: theme.accent, opacity: pressed ? 0.85 : 1 },
          ]}>
          <Text style={styles.buttonLabel}>{actionLabel}</Text>
        </Pressable>
      ) : null}
      {secondaryActionLabel && onSecondaryAction ? (
        <Pressable
          onPress={handleSecondary}
          style={({ pressed }) => [
            styles.secondaryButton,
            { borderColor: theme.glassBorder, opacity: pressed ? 0.7 : 1 },
          ]}>
          <Text style={[styles.secondaryLabel, { color: theme.text.secondary }]}>
            {secondaryActionLabel}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.xxl,
    gap: Spacing.sm,
  },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.xs,
  },
  title: {
    ...Typography.headlineSmall,
    textAlign: 'center',
  },
  description: {
    ...Typography.bodyMedium,
    textAlign: 'center',
    maxWidth: 320,
  },
  button: {
    marginTop: Spacing.md,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.sm + 2,
    borderRadius: 24,
    minWidth: 160,
    alignItems: 'center',
  },
  buttonLabel: {
    ...Typography.titleMedium,
    color: '#0E0A06',
    fontWeight: '700',
  },
  secondaryButton: {
    marginTop: Spacing.xs,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.xs + 2,
    borderRadius: 20,
    borderWidth: 1,
    backgroundColor: Colors.glass.dark,
  },
  secondaryLabel: {
    ...Typography.titleSmall,
  },
});

export const EmptyStateView = memo(EmptyStateViewComponent);
