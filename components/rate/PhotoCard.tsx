import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { forwardRef, useImperativeHandle, useMemo, useState } from "react";
import { ActivityIndicator, Dimensions, Pressable, Text, View, StyleSheet } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
    Easing,
    SharedValue,
    runOnJS,
    useAnimatedStyle,
    useSharedValue,
    withSpring,
    withTiming,
    interpolate,
    Extrapolation
} from "react-native-reanimated";
import { hapticsBridge } from "../../modules/haptics/hapticsBridge";
import { Photo } from "./types";
import Ionicons from "@expo/vector-icons/Ionicons";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

// Spring config matching Swift's spring(response: 0.6, dampingFraction: 0.8)
const SPRING_CONFIG = {
    damping: 20,
    stiffness: 200,
    mass: 1,
};

const SWIPE_THRESHOLD = 120;
const VELOCITY_THRESHOLD = 800;
const ROTATION_DEG = 15;

export interface PhotoCardRef {
    swipe: (direction: "left" | "right") => void;
}

type Props = {
  photo: Photo;
  index: number;
  isTop: boolean;
  onSwipe: (direction: "left" | "right") => void;
  onLongPress?: () => void;
  activeTranslation?: SharedValue<number>;
};

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export const PhotoCard = forwardRef<PhotoCardRef, Props>(({ photo, isTop, onSwipe, onLongPress, activeTranslation }, ref) => {
  const [isLoading, setIsLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  
  // Internal values if no external shared value is provided
  const internalTranslateX = useSharedValue(0);
  const translateX = activeTranslation ?? internalTranslateX;
  
  const translateY = useSharedValue(0);
  const scale = useSharedValue(1);
  const pressScale = useSharedValue(1);
  const rotate = useSharedValue(0);
  const hasThresholdHaptic = useSharedValue(false);

  // Expose swipe method
  useImperativeHandle(ref, () => ({
    swipe: (direction: "left" | "right") => {
        flingOut(direction);
    }
  }));

  const resetPosition = () => {
    translateX.value = withSpring(0, SPRING_CONFIG);
    translateY.value = withSpring(0, SPRING_CONFIG);
    rotate.value = withSpring(0, SPRING_CONFIG);
    scale.value = withSpring(1, SPRING_CONFIG);
    pressScale.value = withSpring(1, { damping: 14 });
    hasThresholdHaptic.value = false;
  };

  const flingOut = (direction: "left" | "right") => {
    const targetX = direction === "right" ? SCREEN_WIDTH * 1.5 : -SCREEN_WIDTH * 1.5;
    translateX.value = withTiming(targetX, { duration: 280, easing: Easing.out(Easing.cubic) }, () =>
      runOnJS(onSwipe)(direction)
    );
    rotate.value = withTiming(direction === "right" ? 18 : -18, { duration: 280 });
    translateY.value = withTiming(-50, { duration: 280 });
  };

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .enabled(isTop)
        .onBegin(() => {
          pressScale.value = withSpring(0.98, { damping: 15 });
          runOnJS(hapticsBridge.pressIn)();
          hasThresholdHaptic.value = false;
        })
        .onChange((event) => {
          translateX.value = event.translationX;
          translateY.value = event.translationY * 0.5; // Dampen vertical movement
          // Interpolate rotation based on X translation specifically for a natural feel
          rotate.value = interpolate(
              event.translationX,
              [-300, 300],
              [-ROTATION_DEG, ROTATION_DEG],
              Extrapolation.CLAMP
          );
          
          const distance = Math.abs(event.translationX);
          if (distance > 60) {
            if (!hasThresholdHaptic.value) {
              hasThresholdHaptic.value = true;
              runOnJS(hapticsBridge.swipeThreshold)();
            }
          } else {
            hasThresholdHaptic.value = false;
          }
        })
        .onEnd((event) => {
          const distance = event.translationX;
          const velocity = event.velocityX;
          
          // Threshold for commiting the swipe
          if (Math.abs(distance) > SWIPE_THRESHOLD || Math.abs(velocity) > VELOCITY_THRESHOLD) {
            const dir = distance > 0 ? "right" : "left";
            runOnJS(hapticsBridge.impact)(distance > 0 ? "heavy" : "light");
            runOnJS(flingOut)(dir);
          } else {
            runOnJS(hapticsBridge.swipeCancel)();
            runOnJS(resetPosition)();
          }
          hasThresholdHaptic.value = false;
        })
        .onFinalize(() => {
          pressScale.value = withSpring(1, { damping: 14 });
        }),
    [isTop]
  );
  
  // Combine gestures
  const pinch = Gesture.Pinch()
        .enabled(isTop)
        .onUpdate((event) => {
          scale.value = Math.min(Math.max(0.9, event.scale), 2.2);
        })
        .onEnd(() => {
          scale.value = withSpring(1, { damping: 12 });
        });

  const longPress = Gesture.LongPress()
        .enabled(isTop)
        .minDuration(450)
        .onStart(() => {
          pressScale.value = withSpring(0.95, { damping: 12 });
          runOnJS(hapticsBridge.pressIn)();
          if (onLongPress) runOnJS(onLongPress)();
        })
        .onEnd(() => {
            pressScale.value = withSpring(1, { damping: 12 });
            runOnJS(hapticsBridge.pressOut)();
        });

  const composed = Gesture.Simultaneous(pan, pinch, longPress);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { rotateZ: `${rotate.value}deg` },
      { scale: scale.value * pressScale.value },
    ],
  }));

  // Swipe indicator animations
  const flameStyle = useAnimatedStyle(() => {
    const progress = translateX.value;
    return {
      opacity: interpolate(progress, [0, 100], [0, 1], Extrapolation.CLAMP),
      transform: [{ scale: interpolate(progress, [0, 150], [0.6, 1.2], Extrapolation.CLAMP) }],
    };
  });

  const xStyle = useAnimatedStyle(() => {
    const progress = -translateX.value;
    return {
      opacity: interpolate(progress, [0, 100], [0, 1], Extrapolation.CLAMP),
      transform: [{ scale: interpolate(progress, [0, 150], [0.6, 1.2], Extrapolation.CLAMP) }],
    };
  });

  return (
    <View style={styles.container} pointerEvents={isTop ? "auto" : "none"}>
      <GestureDetector gesture={composed}>
        <AnimatedPressable
          style={[styles.card, animatedStyle]}
          onLongPress={() => {
            onLongPress?.();
            hapticsBridge.selection();
          }}
        >
          {/* Loading Placeholder */}
          {isLoading && (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#fff" />
              <Text style={styles.loadingText}>Loading...</Text>
            </View>
          )}
          
          {/* Main Image */}
          <Image
            source={{ uri: photo.url }}
            style={styles.image}
            contentFit="cover"
            transition={300}
            cachePolicy="memory-disk"
            onLoadStart={() => {
              setIsLoading(true);
              setLoadFailed(false);
            }}
            onLoad={() => {
              setIsLoading(false);
              setLoadFailed(false);
            }}
            onError={() => {
              console.error("Image load failed:", photo.url);
              setIsLoading(false);
              setLoadFailed(true);
            }}
          />
          
          {/* Error Placeholder */}
          {loadFailed && (
            <View style={styles.errorContainer}>
              <Ionicons name="image-outline" size={64} color="#666" />
              <Text style={styles.errorText}>Image unavailable</Text>
              <Text style={styles.errorSubtext}>{photo.title || "Unknown"}</Text>
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
              <Animated.View style={[styles.indicatorContainer, styles.indicatorRight, flameStyle]}>
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
});

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
    backgroundColor: '#1a1a1a',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 5,
  },
  loadingText: {
    color: '#888',
    fontSize: 16,
    marginTop: 12,
    fontWeight: '500',
  },
  errorContainer: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#1a1a1a',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  errorText: {
    color: '#888',
    fontSize: 18,
    marginTop: 16,
    fontWeight: '600',
  },
  errorSubtext: {
    color: '#555',
    fontSize: 14,
    marginTop: 8,
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
