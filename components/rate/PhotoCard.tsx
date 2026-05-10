import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { forwardRef, useImperativeHandle, useMemo, useState } from 'react';
import { ActivityIndicator, Dimensions, Pressable, Text, View, StyleSheet } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  interpolate,
  Extrapolation,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { hapticsBridge } from '../../modules/haptics/hapticsBridge';
import { Photo } from './types';
import Ionicons from '@expo/vector-icons/Ionicons';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// iOS reference uses SwiftUI .spring(response: 0.3, dampingFraction: 0.6).
// Rigorous mapping: stiffness = (2π / response)² ≈ 438, damping = 2 * dampingFraction * sqrt(stiffness * mass) ≈ 25.
// In practice reanimated v4 with mass 1 feels too snappy at 438 stiffness, so we soften
// stiffness toward ~240–320 and keep mass 0.9 for parity with the SwiftUI feel.
const LIVE_SPRING_CONFIG = {
  damping: 18,
  stiffness: 240,
  mass: 0.9,
  overshootClamping: false,
  restDisplacementThreshold: 0.01,
  restSpeedThreshold: 2,
};

// Tighter snap for cancel-back / programmatic resets — minimal bounce.
const RESET_SPRING_CONFIG = {
  damping: 22,
  stiffness: 320,
  mass: 0.9,
  overshootClamping: false,
};

// Used when the card is committed to fly off-screen — accelerates without visible overshoot.
const EXIT_SPRING_CONFIG = {
  damping: 26,
  stiffness: 200,
  mass: 1,
  overshootClamping: true,
};

const SWIPE_THRESHOLD = 120;
const RESET_THRESHOLD = 80; // <--- Key: Smaller than trigger value (Hysteresis)
const VELOCITY_THRESHOLD = 800;
const ROTATION_DEG = 15;

export interface PhotoCardRef {
  swipe: (direction: 'left' | 'right') => void;
}

type Props = {
  photo: Photo;
  index: number;
  isTop: boolean;
  onSwipe: (direction: 'left' | 'right') => void;
  onLongPress?: () => void;
  activeTranslation?: SharedValue<number>;
};

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export const PhotoCard = forwardRef<PhotoCardRef, Props>(
  ({ photo, isTop, onSwipe, onLongPress, activeTranslation }, ref) => {
    // 🟢 Performance: Start true, only set false once. No complex state resets.
    // This component is keyed by ID in parent, so it remounts for new photos anyway.
    const [isLoading, setIsLoading] = useState(true);

    // 🔥 FIX 1: Always use local SharedValue to control card position
    // This ensures new cards always start from 0 on mount, avoiding inheritance of the previous card's offset (e.g. 500)
    const translateX = useSharedValue(0);
    // Remove the old combined logic
    // const internalTranslateX = useSharedValue(0);
    // const translateX = activeTranslation ?? internalTranslateX;

    const translateY = useSharedValue(0);
    const scale = useSharedValue(1);
    const pressScale = useSharedValue(1);
    const rotate = useSharedValue(0);
    const touchY = useSharedValue(0); // Track touch Y for smart rotation anchor
    const hasThresholdHaptic = useSharedValue(false);

    // Expose swipe method
    useImperativeHandle(ref, () => ({
      swipe: (direction: 'left' | 'right') => {
        // Programmatic swipe needs a synthetic velocity
        const syntheticVelocity = direction === 'right' ? 2000 : -2000;
        flingOut(direction, syntheticVelocity);
      },
    }));

    const resetPosition = () => {
      // Reset local position
      translateX.value = withSpring(0, RESET_SPRING_CONFIG, (finished) => {
        if (finished) {
          // Subtle thud when card settles back
          scheduleOnRN(hapticsBridge.impact, 'light');
        }
      });

      // 🔥 FIX 2: Sycronously reset parent value (to reset background card position)
      if (activeTranslation) {
        activeTranslation.value = withSpring(0, RESET_SPRING_CONFIG);
      }

      translateY.value = withSpring(0, RESET_SPRING_CONFIG);
      rotate.value = withSpring(0, RESET_SPRING_CONFIG);
      scale.value = withSpring(1, RESET_SPRING_CONFIG);
      pressScale.value = withSpring(1, { damping: 14 });
      hasThresholdHaptic.value = false;
    };

    const flingOut = (direction: 'left' | 'right', velocityX: number) => {
      const targetX = direction === 'right' ? SCREEN_WIDTH * 1.5 : -SCREEN_WIDTH * 1.5;

      // Move only "self" (translateX) to fling the card out
      translateX.value = withSpring(targetX, { ...EXIT_SPRING_CONFIG, velocity: velocityX }, () =>
        scheduleOnRN(onSwipe, direction)
      );

      // 🔥 FIX 3: Reset parent value at the same time (smoothly restore background card as top card flies out)
      // This is smoother than waiting for the next card to mount and prevents flickering
      if (activeTranslation) {
        // 🟢 Faster reset for "snappier" background effect
        activeTranslation.value = withSpring(0, RESET_SPRING_CONFIG);
      }

      // Rotation should also follow physics
      rotate.value = withSpring(direction === 'right' ? 25 : -25, {
        ...EXIT_SPRING_CONFIG,
        velocity: velocityX / 10,
      });

      translateY.value = withSpring(-50, EXIT_SPRING_CONFIG);
    };

    const pan = useMemo(
      () =>
        Gesture.Pan()
          .enabled(isTop)
          .onBegin((event) => {
            touchY.value = event.y;
            pressScale.value = withSpring(0.96, { damping: 10, stiffness: 300 }); // Quick response
            scheduleOnRN(hapticsBridge.selectionSoft); // Soft "snapping" feel
            hasThresholdHaptic.value = false;
          })
          .onChange((event) => {
            translateX.value = event.translationX; // Direct 1:1 movement
            translateY.value = event.translationY * 0.5; // Dampen vertical movement

            // 🔥 FIX 4: Manually sync to parent (only to drive background effects)
            if (activeTranslation) {
              activeTranslation.value = event.translationX;
            }

            // 🟢 Smart Rotation Logic
            const CARD_HEIGHT = SCREEN_HEIGHT * 0.6; // Approx height
            const rotateFactor = interpolate(
              touchY.value,
              [0, CARD_HEIGHT],
              [1, -1],
              Extrapolation.CLAMP
            );

            rotate.value = interpolate(
              event.translationX,
              [-SCREEN_WIDTH, SCREEN_WIDTH],
              [-ROTATION_DEG * rotateFactor, ROTATION_DEG * rotateFactor],
              Extrapolation.EXTEND
            );

            const distance = Math.abs(event.translationX);

            // 🟢 Hysteresis Logic
            if (distance > SWIPE_THRESHOLD) {
              if (!hasThresholdHaptic.value) {
                hasThresholdHaptic.value = true;
                scheduleOnRN(hapticsBridge.swipeThreshold);
              }
            } else if (distance < RESET_THRESHOLD) {
              // Only allow reset if back within inner circle (80px)
              if (hasThresholdHaptic.value) {
                hasThresholdHaptic.value = false;
                // Optional: very light feedback when returning to center
              }
            }
          })
          .onEnd((event) => {
            const distance = event.translationX;
            const velocity = event.velocityX;

            // Threshold for commiting the swipe
            if (Math.abs(distance) > SWIPE_THRESHOLD || Math.abs(velocity) > VELOCITY_THRESHOLD) {
              const dir = distance > 0 ? 'right' : 'left';

              // Velocity-based Haptics
              if (Math.abs(velocity) > 2000) {
                scheduleOnRN(hapticsBridge.impact, 'heavy');
              } else {
                scheduleOnRN(hapticsBridge.impact, 'medium');
              }

              scheduleOnRN(flingOut, dir, velocity);
            } else {
              scheduleOnRN(hapticsBridge.swipeCancel);
              scheduleOnRN(resetPosition);
            }
            hasThresholdHaptic.value = false;
          })
          .onFinalize(() => {
            pressScale.value = withSpring(1, { damping: 14 });
          }),
      [isTop, activeTranslation] // Add activeTranslation dependency
    );

    // Combine gestures
    const pinch = Gesture.Pinch()
      .enabled(isTop)
      .onUpdate((event) => {
        scale.value = Math.min(Math.max(0.9, event.scale), 2.2);
      })
      .onEnd(() => {
        // In-flight bounce back to neutral after pinch release
        scale.value = withSpring(1, LIVE_SPRING_CONFIG);
      });

    const longPress = Gesture.LongPress()
      .enabled(isTop)
      .minDuration(450)
      .onStart(() => {
        pressScale.value = withSpring(0.95, { damping: 12 });
        scheduleOnRN(hapticsBridge.pressIn);
        if (onLongPress) scheduleOnRN(onLongPress);
      })
      .onEnd(() => {
        pressScale.value = withSpring(1, { damping: 12 });
        scheduleOnRN(hapticsBridge.pressOut);
      });

    const composed = Gesture.Simultaneous(pan, pinch, longPress);

    const animatedStyle = useAnimatedStyle(() => {
      // Dynamic Shadow based on drag distance
      const dragProgress = Math.min(Math.abs(translateX.value) / 100, 1);

      return {
        transform: [
          { translateX: translateX.value },
          { translateY: translateY.value },
          { rotateZ: `${rotate.value}deg` },
          { scale: scale.value * pressScale.value },
        ],
        // 🟢 Dynamic Shadow Change
        shadowOpacity: interpolate(dragProgress, [0, 1], [0.3, 0.6]),
        shadowRadius: interpolate(dragProgress, [0, 1], [8, 20]),
        elevation: interpolate(dragProgress, [0, 1], [5, 15]),
      };
    });

    // Swipe indicator animations with Parallax
    const flameStyle = useAnimatedStyle(() => {
      const progress = translateX.value;
      return {
        opacity: interpolate(progress, [0, 100], [0, 1], Extrapolation.CLAMP),
        transform: [
          { scale: interpolate(progress, [0, 150], [0.6, 1.2], Extrapolation.CLAMP) },
          // Parallax effect: moves slightly as it fades in
          { translateX: interpolate(progress, [0, 100], [-20, 0], Extrapolation.CLAMP) },
        ],
      };
    });

    const xStyle = useAnimatedStyle(() => {
      const progress = -translateX.value;
      return {
        opacity: interpolate(progress, [0, 100], [0, 1], Extrapolation.CLAMP),
        transform: [
          { scale: interpolate(progress, [0, 150], [0.6, 1.2], Extrapolation.CLAMP) },
          // Parallax effect
          { translateX: interpolate(progress, [0, 100], [20, 0], Extrapolation.CLAMP) },
        ],
      };
    });

    return (
      <View style={styles.container} pointerEvents={isTop ? 'auto' : 'none'}>
        <GestureDetector gesture={composed}>
          <AnimatedPressable
            style={[styles.card, animatedStyle]}
            onLongPress={() => {
              onLongPress?.();
              hapticsBridge.selection();
            }}>
            {/* 🟢 Background Color (Prevents transparency before image load) */}
            <View style={[StyleSheet.absoluteFill, { backgroundColor: '#1a1a1a' }]} />

            {/* Main Image */}
            <Image
              key={photo.url} // 🟢 Key forces fresh mount if url changes, but we rely on parent keys usually
              source={{ uri: photo.url }}
              style={styles.image}
              contentFit="cover"
              // 🔥 Prevent white flash during recycling
              placeholderContentFit="cover"
              // 🟢 Disable transition or set very short to avoid ghosting on fast swipes
              transition={200}
              // 🟢 Ensure memory-disk cache usage
              cachePolicy="memory-disk"
              // 🟢 Don't hide Image based on isLoading, keep it mounted
              // Removed onLoadStart to prevent resetting isLoading to true on cache hits/updates
              onLoad={() => setIsLoading(false)}
            />

            {/* Loading indicator just overlays, doesn't replace Image */}
            {isLoading && (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="small" color="#fff" />
              </View>
            )}

            {/* Bottom Gradient for text readability */}
            <LinearGradient
              colors={['transparent', 'rgba(0,0,0,0.4)', 'rgba(0,0,0,0.8)']}
              style={styles.bottomGradient}
            />

            {/* Swipe Indicators */}
            {isTop && (
              <>
                <Animated.View
                  style={[styles.indicatorContainer, styles.indicatorRight, flameStyle]}>
                  <View style={styles.likeIndicator}>
                    <Ionicons name="flame" size={36} color="#fff" />
                  </View>
                </Animated.View>
                <Animated.View style={[styles.indicatorContainer, styles.indicatorLeft, xStyle]}>
                  <View style={styles.skipIndicator}>
                    <Ionicons name="close" size={32} color="#fff" />
                  </View>
                </Animated.View>
              </>
            )}
          </AnimatedPressable>
        </GestureDetector>
      </View>
    );
  }
);

const styles = StyleSheet.create({
  container: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    width: '100%',
    height: '100%',
    backgroundColor: '#1a1a1a',
    borderRadius: 24,
    overflow: 'hidden',
    // Shadow for depth
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 12,
  },
  image: {
    width: '100%',
    height: '100%',
    position: 'absolute',
  },
  loadingContainer: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(26,26,26,0.5)', // Semi-transparent
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 5,
  },
  bottomGradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 200,
    zIndex: 2,
  },
  indicatorContainer: {
    position: 'absolute',
    top: 80,
    zIndex: 20,
  },
  indicatorRight: {
    right: 24,
  },
  indicatorLeft: {
    left: 24,
  },
  likeIndicator: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(249, 115, 22, 0.9)', // orange-500
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: 'rgba(255, 255, 255, 0.3)',
    // Glow effect
    shadowColor: '#F97316',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 12,
  },
  skipIndicator: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(63, 63, 70, 0.9)', // zinc-700
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
});
