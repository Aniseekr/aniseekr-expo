import { ReactElement, forwardRef, useCallback, useImperativeHandle, useMemo, useState } from 'react';
import { Dimensions, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { getAdUnitId } from '../../libs/services/ads/ad-config';
import { useSubscription } from '../../context/SubscriptionContext';
import { Colors, Radius, Spacing, Typography } from '../../constants/DesignSystem';
import {
  getStackRevealTranslation,
  STACK_REVEAL_DISTANCE,
  runSwipeHandoff,
} from '../../libs/services/rate/swipe-animation';

type BannerProps = {
  unitId: string;
  size: string;
  onAdFailedToLoad?: (e: unknown) => void;
};

let BannerAdComponent: ((props: BannerProps) => ReactElement) | null = null;
let BannerSize: { MEDIUM_RECTANGLE?: string } | null = null;

try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require('react-native-google-mobile-ads');
  BannerAdComponent = mod.BannerAd;
  BannerSize = mod.BannerAdSize;
} catch {
  BannerAdComponent = null;
}

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const SWIPE_THRESHOLD = 120;
const VELOCITY_THRESHOLD = 800;
const AD_WIDTH = 300;
const AD_HEIGHT = 250;

const RESET_SPRING_CONFIG = {
  damping: 18,
  stiffness: 180,
  mass: 1,
  overshootClamping: true,
};

export interface NativeAdCardRef {
  swipe: (direction: 'left' | 'right') => void;
}

interface Props {
  isTop: boolean;
  onSwipe: (direction: 'left' | 'right') => void;
  activeTranslation?: SharedValue<number>;
}

export const NativeAdCard = forwardRef<NativeAdCardRef, Props>(
  ({ isTop, onSwipe, activeTranslation }, ref) => {
    const subscription = useSubscription();
    const [errored, setErrored] = useState(false);

    const translateX = useSharedValue(0);
    const translateY = useSharedValue(0);
    const rotate = useSharedValue(0);
    const handOffSwipe = useCallback(
      (direction: 'left' | 'right') => {
        runSwipeHandoff(direction, onSwipe);
      },
      [onSwipe]
    );

    const flingOut = (direction: 'left' | 'right', velocityX: number) => {
      const targetX = direction === 'right' ? SCREEN_WIDTH * 1.5 : -SCREEN_WIDTH * 1.5;
      translateX.value = withSpring(
        targetX,
        {
          velocity: velocityX,
          damping: 20,
          stiffness: 120,
          overshootClamping: true,
        }
      );
      if (activeTranslation) {
        activeTranslation.value = withSpring(getStackRevealTranslation(direction), {
          damping: 20,
          stiffness: 120,
          overshootClamping: true,
        });
      }
      rotate.value = withSpring(direction === 'right' ? 25 : -25, {
        velocity: velocityX / 10,
        damping: 20,
        stiffness: 120,
      });
      translateY.value = withSpring(-50, { damping: 20, stiffness: 120 });
      handOffSwipe(direction);
    };

    useImperativeHandle(ref, () => ({
      swipe: (direction: 'left' | 'right') => {
        const syntheticVelocity = direction === 'right' ? 2000 : -2000;
        flingOut(direction, syntheticVelocity);
      },
    }));

    const resetPosition = () => {
      translateX.value = withSpring(0, RESET_SPRING_CONFIG);
      translateY.value = withSpring(0, RESET_SPRING_CONFIG);
      rotate.value = withSpring(0, RESET_SPRING_CONFIG);
      if (activeTranslation) {
        activeTranslation.value = withSpring(0, RESET_SPRING_CONFIG);
      }
    };

    const pan = useMemo(
      () =>
        Gesture.Pan()
          .enabled(isTop)
          .onChange((event) => {
            translateX.value = event.translationX;
            translateY.value = event.translationY * 0.5;
            if (activeTranslation) {
              activeTranslation.value = event.translationX;
            }
            rotate.value = (event.translationX / SCREEN_WIDTH) * 15;
          })
          .onEnd((event) => {
            const distance = event.translationX;
            const velocity = event.velocityX;
            if (Math.abs(distance) > SWIPE_THRESHOLD || Math.abs(velocity) > VELOCITY_THRESHOLD) {
              const dir = distance > 0 ? 'right' : 'left';
              const targetX = dir === 'right' ? SCREEN_WIDTH * 1.5 : -SCREEN_WIDTH * 1.5;
              translateX.value = withSpring(targetX, {
                velocity,
                damping: 20,
                stiffness: 120,
                overshootClamping: true,
              });
              if (activeTranslation) {
                activeTranslation.value = withSpring(
                  dir === 'right' ? STACK_REVEAL_DISTANCE : -STACK_REVEAL_DISTANCE,
                  {
                    damping: 20,
                    stiffness: 120,
                    overshootClamping: true,
                  }
                );
              }
              rotate.value = withSpring(dir === 'right' ? 25 : -25, {
                velocity: velocity / 10,
                damping: 20,
                stiffness: 120,
              });
              translateY.value = withSpring(-50, { damping: 20, stiffness: 120 });
              scheduleOnRN(handOffSwipe, dir);
            } else {
              scheduleOnRN(resetPosition);
            }
          }),
      [isTop, activeTranslation, handOffSwipe]
    );

    const animatedStyle = useAnimatedStyle(() => ({
      transform: [
        { translateX: translateX.value },
        { translateY: translateY.value },
        { rotateZ: `${rotate.value}deg` },
      ],
    }));

    if (subscription.isPro) return null;
    const unitId = getAdUnitId('rate_native');
    if (!unitId || !BannerAdComponent || !BannerSize || errored) return null;

    return (
      <View style={styles.container} pointerEvents={isTop ? 'auto' : 'none'}>
        <GestureDetector gesture={pan}>
          <Animated.View style={[styles.card, animatedStyle]}>
            <View style={styles.label}>
              <Text style={styles.labelText}>Ad</Text>
            </View>
            <View style={styles.adSlot} pointerEvents="none">
              <BannerAdComponent
                unitId={unitId}
                size={BannerSize.MEDIUM_RECTANGLE ?? 'MEDIUM_RECTANGLE'}
                onAdFailedToLoad={() => setErrored(true)}
              />
            </View>
          </Animated.View>
        </GestureDetector>
      </View>
    );
  }
);

NativeAdCard.displayName = 'NativeAdCard';

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
    backgroundColor: Colors.background.secondary,
    borderRadius: Radius.xl,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.glass.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 12,
  },
  label: {
    position: 'absolute',
    top: Spacing.sm,
    right: Spacing.sm,
    paddingHorizontal: Spacing.xs,
    paddingVertical: 2,
    borderRadius: Radius.sm,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.glass.border,
    zIndex: 10,
  },
  labelText: {
    ...Typography.captionSmall,
    color: Colors.text.tertiary,
    letterSpacing: 0.5,
  },
  adSlot: {
    width: AD_WIDTH,
    height: AD_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
