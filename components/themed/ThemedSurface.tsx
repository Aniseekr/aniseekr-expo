import { ReactNode, type Ref } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { Radius, Spacing } from '../../constants/DesignSystem';
import { useTheme } from '../../context/ThemeContext';

export type SurfaceVariant = 'card' | 'elevated' | 'outlined' | 'sheet';

export interface ThemedSurfaceProps {
  variant?: SurfaceVariant;
  radius?: number;
  padded?: boolean | number;
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
  ref?: Ref<View>;
}

export function ThemedSurface({
  variant = 'card',
  radius = Radius.card,
  padded,
  style,
  children,
  ref,
}: ThemedSurfaceProps) {
  const { theme } = useTheme();

  let backgroundColor = theme.background.secondary;
  let borderColor: string = theme.glassBorder;
  let borderWidth = 1;

  if (variant === 'elevated') {
    backgroundColor = theme.background.tertiary;
  } else if (variant === 'outlined') {
    backgroundColor = 'transparent';
    borderWidth = 1.5;
  } else if (variant === 'sheet') {
    backgroundColor = theme.background.primary;
  }

  const padding = padded === true ? Spacing.md : typeof padded === 'number' ? padded : 0;

  return (
    <View
      ref={ref}
      style={[
        styles.base,
        {
          backgroundColor,
          borderColor,
          borderWidth,
          borderRadius: radius,
          padding,
        },
        style,
      ]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    overflow: 'hidden',
  },
});
