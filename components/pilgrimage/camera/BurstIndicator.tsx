// Visual progress ring rendered over the shutter button during burst capture.
//
// We avoid Skia / SVG and lay out N small dots around a circle using plain
// absolute-positioned Views. Each dot lights up (accent color) as that frame
// is captured; un-fired dots use the theme's tertiary surface so they stay
// visible on top of the camera scrim.
//
// The component renders an `absoluteFill` view, so the caller (ShutterRow)
// is responsible for stacking it on top of the shutter Pressable.

import { StyleSheet, View } from 'react-native';
import { useTheme } from '../../../context/ThemeContext';
import { ThemedText } from '../../themed';

interface BurstIndicatorProps {
  captured: number;
  total: number;
  themeColor: string;
}

const DOT_SIZE = 8;
// Distance from the centre of the shutter (in px) to the centre of each dot.
// 39 ≈ shutterOuter radius, so dots ride the inner edge of the border.
const RING_RADIUS = 39;

export default function BurstIndicator({ captured, total, themeColor }: BurstIndicatorProps) {
  const { theme } = useTheme();

  const safeTotal = Math.max(1, total);
  const filledCount = Math.max(0, Math.min(safeTotal, captured));

  const dots = Array.from({ length: safeTotal }, (_, i) => {
    // Start at top (-90°) and walk clockwise so dot[0] sits at 12 o'clock.
    const angleDeg = -90 + (360 / safeTotal) * i;
    const angleRad = (angleDeg * Math.PI) / 180;
    const dx = Math.cos(angleRad) * RING_RADIUS;
    const dy = Math.sin(angleRad) * RING_RADIUS;
    const isFilled = i < filledCount;
    return (
      <View
        key={i}
        style={[
          styles.dot,
          {
            transform: [{ translateX: dx - DOT_SIZE / 2 }, { translateY: dy - DOT_SIZE / 2 }],
            backgroundColor: isFilled ? themeColor : theme.background.tertiary,
            borderColor: theme.glassBorder,
          },
        ]}
      />
    );
  });

  return (
    <View style={styles.container} pointerEvents="none">
      <View style={styles.ring}>{dots}</View>
      <View style={styles.labelWrap}>
        <ThemedText variant="captionSmall" weight="700" align="center" style={styles.label}>
          {filledCount}/{safeTotal}
        </ThemedText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ring: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    width: 0,
    height: 0,
  },
  dot: {
    position: 'absolute',
    width: DOT_SIZE,
    height: DOT_SIZE,
    borderRadius: DOT_SIZE / 2,
    borderWidth: 1,
  },
  labelWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    // The label sits in the centre of the shutter and needs to stay legible
    // on top of the inner accent disc; bake a soft shadow rather than a
    // hardcoded colour so it inherits ThemedText tonal logic.
    textShadowColor: 'rgba(0,0,0,0.55)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
});
