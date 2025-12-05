import { Image } from "expo-image";
import { useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
    Easing,
    runOnJS,
    useAnimatedStyle,
    useSharedValue,
    withSpring,
    withTiming,
} from "react-native-reanimated";
import { hapticsBridge } from "../../modules/haptics/hapticsBridge";
import { Photo } from "./types";

type Props = {
  photo: Photo;
  index: number;
  isTop: boolean;
  onSwipe: (direction: "left" | "right") => void;
  onLongPress?: () => void;
};

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function PhotoCard({ photo, index, isTop, onSwipe, onLongPress }: Props) {
  const [blurEnabled, setBlurEnabled] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const scale = useSharedValue(1);
  const pressScale = useSharedValue(1);
  const rotate = useSharedValue(0);
  const hasThresholdHaptic = useSharedValue(false);

  const resetPosition = () => {
    translateX.value = withSpring(0);
    translateY.value = withSpring(0);
    rotate.value = withSpring(0);
    scale.value = withSpring(1);
    pressScale.value = withSpring(1, { damping: 14 });
    hasThresholdHaptic.value = false;
  };

  const flingOut = (direction: "left" | "right") => {
    const targetX = direction === "right" ? 900 : -900;
    translateX.value = withTiming(targetX, { duration: 240, easing: Easing.out(Easing.quad) }, () =>
      runOnJS(onSwipe)(direction)
    );
    rotate.value = withTiming(direction === "right" ? 12 : -12, { duration: 240 });
  };

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .enabled(isTop)
        .onBegin(() => {
          pressScale.value = withSpring(0.97, { damping: 12 });
          runOnJS(hapticsBridge.pressIn)();
          hasThresholdHaptic.value = false;
        })
        .onChange((event) => {
          translateX.value = event.translationX;
          translateY.value = event.translationY;
          rotate.value = event.translationX / 18;
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
          if (Math.abs(distance) > 140) {
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
          pressScale.value = withSpring(1, { damping: 12 });
        }),
    [flingOut, isTop]
  );

  const pinch = useMemo(
    () =>
      Gesture.Pinch()
        .enabled(isTop)
        .onUpdate((event) => {
          scale.value = Math.min(Math.max(0.9, event.scale), 2.2);
        })
        .onEnd(() => {
          scale.value = withSpring(1, { damping: 12 });
        }),
    [isTop]
  );

  const longPress = useMemo(
    () =>
      Gesture.LongPress()
        .enabled(isTop)
        .minDuration(450)
        .onStart(() => {
          pressScale.value = withSpring(0.95, { damping: 12 });
          runOnJS(hapticsBridge.pressIn)();
          runOnJS(onLongPress ?? (() => {}))();
        })
        .onEnd(() => {
          pressScale.value = withSpring(1, { damping: 12 });
          runOnJS(hapticsBridge.pressOut)();
        }),
    [isTop, onLongPress]
  );

  const composed = Gesture.Simultaneous(pan, pinch, longPress);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { rotateZ: `${rotate.value}deg` },
      { scale: scale.value * pressScale.value },
    ],
  }));

  const indicatorOpacity = (direction: "left" | "right") =>
    useAnimatedStyle(() => {
      const progress = direction === "right" ? translateX.value : -translateX.value;
      return {
        opacity: Math.min(Math.max(progress / 140, 0), 1),
        transform: [{ scale: 0.9 + Math.min(progress / 420, 0.2) }],
      };
    });

  const flameStyle = indicatorOpacity("right");
  const xStyle = indicatorOpacity("left");

  return (
    <View className="w-full items-center" pointerEvents={isTop ? "auto" : "none"}>
      <GestureDetector gesture={composed}>
        <AnimatedPressable
          style={animatedStyle}
          className="w-[88%] aspect-[9/16] rounded-2xl overflow-hidden bg-black/20"
        >
          <Image
            source={{ uri: photo.url }}
            className="w-full h-full"
            contentFit="cover"
            transition={200}
            onError={() => setLoadFailed(true)}
          />
          {blurEnabled ? (
            <Pressable
              className="absolute inset-0 bg-black/60 items-center justify-center px-4"
              onLongPress={() => {
                setBlurEnabled(false);
                hapticsBridge.selection();
              }}
              delayLongPress={400}
            >
              <Text className="text-white text-xl font-semibold mb-1">Sensitive content hidden</Text>
              <Text className="text-white/80 text-sm">Long press to reveal</Text>
            </Pressable>
          ) : null}
          {loadFailed ? (
            <View className="absolute inset-0 items-center justify-center bg-black/40">
              <Text className="text-white text-xl">⚠️</Text>
              <Text className="text-white/80 mt-2">Image failed to load</Text>
            </View>
          ) : null}
          {isTop ? (
            <>
              <Animated.View style={flameStyle} className="absolute right-6 top-6">
                <View className="w-16 h-16 rounded-full bg-white/15 items-center justify-center">
                  <Text className="text-white text-3xl">🔥</Text>
                </View>
              </Animated.View>
              <Animated.View style={xStyle} className="absolute left-6 top-6">
                <View className="w-16 h-16 rounded-full bg-white/15 items-center justify-center">
                  <Text className="text-white text-3xl">✕</Text>
                </View>
              </Animated.View>
            </>
          ) : null}
        </AnimatedPressable>
      </GestureDetector>
      <View className="h-6" />
    </View>
  );
}

