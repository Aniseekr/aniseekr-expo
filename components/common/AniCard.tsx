import { memo } from 'react';
import { View, ViewProps, Platform, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, Radius, Shadow } from '../../constants/DesignSystem';

export type AniCardVariant = 'glass' | 'solid' | 'gradient' | 'bordered' | 'elevated';

interface AniCardProps extends Omit<ViewProps, 'style'> {
  children: React.ReactNode;
  variant?: AniCardVariant;
  radius?: keyof typeof Radius | number;
  padding?: number;
  gradientColors?: readonly [string, string, ...string[]];
  intensity?: number;
  style?: StyleProp<ViewStyle>;
  elevated?: boolean;
}

function resolveRadius(radius: AniCardProps['radius']): number {
  if (typeof radius === 'number') return radius;
  if (radius && radius in Radius) return Radius[radius];
  return Radius.card;
}

function AniCardComponent({
  children,
  variant = 'glass',
  radius = 'card',
  padding,
  gradientColors,
  intensity,
  style,
  elevated,
  ...props
}: AniCardProps) {
  const cornerRadius = resolveRadius(radius);
  const shadow = elevated ? Shadow.medium : variant === 'elevated' ? Shadow.heavy : undefined;

  const baseStyle: StyleProp<ViewStyle> = [
    {
      borderRadius: cornerRadius,
      overflow: 'hidden',
      ...(padding !== undefined ? { padding } : {}),
    },
    shadow,
    style,
  ];

  if (variant === 'glass') {
    if (Platform.OS === 'ios') {
      return (
        <BlurView
          intensity={intensity ?? 30}
          tint="systemThickMaterialDark"
          style={baseStyle}
          {...props}>
          <View style={styles.glassOverlay}>
            <View
              style={[styles.glassBorder, { borderRadius: cornerRadius }]}
              pointerEvents="none"
            />
            <View
              style={[styles.glassInnerBorder, { borderRadius: cornerRadius }]}
              pointerEvents="none"
            />
            {children}
          </View>
        </BlurView>
      );
    }
    return (
      <View style={[baseStyle, styles.glassAndroid]} {...props}>
        <View style={[styles.glassBorder, { borderRadius: cornerRadius }]} pointerEvents="none" />
        {children}
      </View>
    );
  }

  if (variant === 'solid') {
    return (
      <View style={[baseStyle, { backgroundColor: Colors.background.secondary }]} {...props}>
        {children}
      </View>
    );
  }

  if (variant === 'gradient') {
    return (
      <View style={baseStyle} {...props}>
        <LinearGradient
          colors={gradientColors ?? Colors.gradients.primary}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        <View style={[styles.glassBorder, { borderRadius: cornerRadius }]} pointerEvents="none" />
        {children}
      </View>
    );
  }

  if (variant === 'bordered') {
    return (
      <View
        style={[
          baseStyle,
          {
            backgroundColor: Colors.glass.dark,
            borderWidth: 1,
            borderColor: Colors.glass.borderHeavy,
          },
        ]}
        {...props}>
        {children}
      </View>
    );
  }

  // elevated
  return (
    <View style={[baseStyle, { backgroundColor: Colors.background.secondary }]} {...props}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  glassOverlay: {
    flex: 1,
    backgroundColor: Colors.glass.medium,
  },
  glassAndroid: {
    backgroundColor: Colors.background.secondary,
  },
  glassBorder: {
    ...StyleSheet.absoluteFillObject,
    borderWidth: 1,
    borderColor: Colors.glass.border,
  },
  glassInnerBorder: {
    ...StyleSheet.absoluteFillObject,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
});

export const AniCard = memo(AniCardComponent);
