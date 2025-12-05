import { View, ViewProps, Platform, StyleSheet } from 'react-native';
import { BlurView } from 'expo-blur';
import { memo } from 'react';

interface GlassCardProps extends ViewProps {
  children: React.ReactNode;
  intensity?: number;
}

function GlassCardComponent({ children, style, intensity = 20, className, ...props }: GlassCardProps & { className?: string }) {
  if (Platform.OS === 'ios') {
    return (
      <BlurView intensity={intensity} tint="dark" style={[styles.base, style]} {...props}>
        <View className={className || "bg-white/5"}>{children}</View>
      </BlurView>
    );
  }

  return (
    <View className={className} style={[styles.base, styles.android, style]} {...props}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  android: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
  },
});

export const GlassCard = memo(GlassCardComponent);


