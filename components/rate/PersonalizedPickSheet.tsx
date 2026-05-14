import { Image } from 'expo-image';
import { memo, useEffect } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Extrapolation,
  FadeInUp,
  FadeOutDown,
  interpolate,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { hapticsBridge } from '../../modules/haptics/hapticsBridge';
import { AIRecommendation } from './types';

type Props = {
  visible: boolean;
  data: AIRecommendation;
  onClose: () => void;
  onSelect?: () => void;
};

const DRAG_THRESHOLD = 100;
const VELOCITY_THRESHOLD = 800;
const ELASTIC_LIMIT = 200;
const ELASTIC_FACTOR = 0.4;
const DISMISS_TARGET = 600;

// Match iOS spring(response: 0.3, dampingFraction: 0.8); reanimated v4 lands close at
// stiffness ~220 / damping ~20 with mass 0.9 once the sheet is on JS thread.
const SHEET_SPRING_CONFIG = {
  damping: 20,
  stiffness: 220,
  mass: 0.9,
};

function AIRecommendationSheetComponent({ visible, data, onClose, onSelect }: Props) {
  const translateY = useSharedValue(0);
  const hasThresholdHaptic = useSharedValue(false);

  // Reset position whenever the sheet becomes visible again after a dismiss.
  useEffect(() => {
    if (visible) {
      translateY.value = 0;
      hasThresholdHaptic.value = false;
    }
  }, [visible, translateY, hasThresholdHaptic]);

  const pan = Gesture.Pan()
    .onUpdate((event) => {
      const raw = Math.max(0, event.translationY);
      if (raw <= ELASTIC_LIMIT) {
        translateY.value = raw;
      } else {
        const overshoot = raw - ELASTIC_LIMIT;
        translateY.value = ELASTIC_LIMIT + overshoot * ELASTIC_FACTOR;
      }
    })
    .onEnd((event) => {
      const shouldDismiss =
        translateY.value > DRAG_THRESHOLD || event.velocityY > VELOCITY_THRESHOLD;
      if (shouldDismiss) {
        translateY.value = withSpring(DISMISS_TARGET, SHEET_SPRING_CONFIG);
        scheduleOnRN(onClose);
      } else {
        translateY.value = withSpring(0, SHEET_SPRING_CONFIG);
      }
      hasThresholdHaptic.value = false;
    });

  // Fire a single haptic when the user crosses the dismiss threshold going down.
  useAnimatedReaction(
    () => translateY.value > DRAG_THRESHOLD,
    (crossed, previous) => {
      if (crossed && !previous && !hasThresholdHaptic.value) {
        hasThresholdHaptic.value = true;
        scheduleOnRN(hapticsBridge.swipeThreshold);
      } else if (!crossed && previous) {
        hasThresholdHaptic.value = false;
      }
    }
  );

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: translateY.value },
      {
        scale: interpolate(translateY.value, [0, 400], [1, 0.92], Extrapolation.CLAMP),
      },
    ],
    opacity: interpolate(translateY.value, [0, 400], [1, 0.3], Extrapolation.CLAMP),
  }));

  const handleClose = () => {
    translateY.value = 0;
    hasThresholdHaptic.value = false;
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
      <Pressable className="flex-1 bg-black/60" onPress={handleClose}>
        <GestureDetector gesture={pan}>
          <Animated.View
            entering={FadeInUp.duration(220)}
            exiting={FadeOutDown.duration(200)}
            style={sheetStyle}
            className="bg-card-surface border-card-border mt-auto rounded-t-3xl border-t p-5">
            <View className="mb-3 items-center">
              <View className="h-1.5 w-10 rounded-full bg-white/20" />
            </View>
            <View className="mb-3 flex-row items-center justify-between">
              <Text className="text-lg font-semibold text-white">AI Recommendation</Text>
              <Pressable onPress={handleClose} className="rounded-full bg-white/10 px-3 py-1">
                <Text className="text-xs text-white">Close</Text>
              </Pressable>
            </View>
            {data.loading ? (
              <View className="items-center py-6">
                <Text className="text-white/80">Thinking...</Text>
              </View>
            ) : data.anime ? (
              <Pressable
                onPress={onSelect}
                className="border-card-border bg-card-surface flex-row gap-3 overflow-hidden rounded-2xl border">
                <Image
                  source={{ uri: data.anime.image }}
                  className="h-40 w-28 bg-black/20"
                  contentFit="cover"
                  transition={150}
                />
                <View className="flex-1 justify-center pr-3">
                  <Text className="text-lg font-semibold text-white" numberOfLines={2}>
                    {data.anime.title}
                  </Text>
                  <Text className="mt-2 text-xs text-white/70" numberOfLines={3}>
                    Tailored using your recent ratings and mood picks.
                  </Text>
                </View>
              </Pressable>
            ) : (
              <View className="items-center py-6">
                <Text className="text-white/80">Pull down to ask AI for a pick.</Text>
              </View>
            )}
          </Animated.View>
        </GestureDetector>
      </Pressable>
    </Modal>
  );
}

export const AIRecommendationSheet = memo(AIRecommendationSheetComponent);
