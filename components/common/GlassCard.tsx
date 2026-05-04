import { View, ViewProps, Platform, StyleSheet } from 'react-native';
import { BlurView } from 'expo-blur';
import { memo } from 'react';
import { Colors, Radius } from '../../constants/DesignSystem';

type GlassVariant = 'default' | 'clear' | 'frosted' | 'dark';

interface GlassCardProps extends ViewProps {
  children: React.ReactNode;
  intensity?: number;
  variant?: GlassVariant;
  className?: string;
}

function GlassCardComponent({
  children,
  style,
  intensity,
  variant = 'default',
  className,
  ...props
}: GlassCardProps) {
  const getIntensity = () => {
    if (intensity !== undefined) return intensity;
    switch (variant) {
      case 'clear':
        return 20;
      case 'frosted':
        return 80;
      case 'dark':
        return 60;
      default:
        return 50;
    }
  };

  const getTint = (): React.ComponentProps<typeof BlurView>['tint'] => {
    switch (variant) {
      case 'clear':
        return 'systemUltraThinMaterialDark';
      case 'frosted':
        return 'systemThickMaterialDark';
      case 'dark':
        return 'systemThickMaterialDark';
      default:
        return 'systemThickMaterialDark';
    }
  };

  const baseStyle = [styles.base, style];
  if (variant === 'dark') baseStyle.push(styles.darkBorder);

  if (Platform.OS === 'ios') {
    return (
      <BlurView intensity={getIntensity()} tint={getTint()} style={baseStyle} {...props}>
        <View style={styles.innerBorder} pointerEvents="none" />
        <View className={`bg-white/5 ${className || ''}`}>{children}</View>
      </BlurView>
    );
  }

  // Android fallback
  return (
    <View
      className={`bg-white/10 ${className || ''}`}
      style={[styles.base, styles.android, style]}
      {...props}>
      <View style={styles.innerBorder} pointerEvents="none" />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: Radius.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.glass.border,
  },
  innerBorder: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  darkBorder: {
    borderColor: Colors.glass.dark,
  },
  android: {
    backgroundColor: Colors.background.secondary,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
  },
});

export const GlassCard = memo(GlassCardComponent);
