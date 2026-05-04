import { memo } from 'react';
import { Pressable, StyleSheet, Text, View, ViewStyle } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Colors, Spacing, Typography } from '../../constants/DesignSystem';
import { hapticsBridge } from '../../modules/haptics/hapticsBridge';
import { useTheme } from '../../context/ThemeContext';

interface ErrorStateViewProps {
  title?: string;
  message?: string;
  onRetry?: () => void;
  retryLabel?: string;
  style?: ViewStyle;
  variant?: 'inline' | 'fullscreen';
}

function ErrorStateViewComponent({
  title = 'Something went wrong',
  message = 'Please try again in a moment.',
  onRetry,
  retryLabel = 'Try again',
  style,
  variant = 'inline',
}: ErrorStateViewProps) {
  const { theme } = useTheme();

  const handleRetry = () => {
    hapticsBridge.warning();
    onRetry?.();
  };

  return (
    <View style={[styles.container, variant === 'fullscreen' && styles.fullscreen, style]}>
      <View style={styles.iconCircle}>
        <MaterialIcons name="error-outline" size={32} color={Colors.error} />
      </View>
      <Text style={[styles.title, { color: theme.text.primary }]}>{title}</Text>
      <Text style={[styles.message, { color: theme.text.secondary }]}>{message}</Text>
      {onRetry ? (
        <Pressable
          onPress={handleRetry}
          style={({ pressed }) => [
            styles.button,
            { backgroundColor: theme.accent, opacity: pressed ? 0.85 : 1 },
          ]}>
          <MaterialIcons name="refresh" size={18} color="#0E0A06" />
          <Text style={styles.buttonLabel}>{retryLabel}</Text>
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
    paddingVertical: Spacing.lg,
    gap: Spacing.sm,
  },
  fullscreen: {
    flex: 1,
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(255, 69, 58, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.xs,
  },
  title: {
    ...Typography.headlineSmall,
    textAlign: 'center',
  },
  message: {
    ...Typography.bodyMedium,
    textAlign: 'center',
    maxWidth: 320,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    marginTop: Spacing.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: 22,
  },
  buttonLabel: {
    ...Typography.titleSmall,
    color: '#0E0A06',
    fontWeight: '700',
  },
});

export const ErrorStateView = memo(ErrorStateViewComponent);
