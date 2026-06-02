import { type Ref } from 'react';
import { StyleSheet, type ViewStyle } from 'react-native';
import Animated, {
  Extrapolation,
  SharedValue,
  interpolate,
  useAnimatedStyle,
  useDerivedValue,
} from 'react-native-reanimated';
import { NativeAdCard, type NativeAdCardRef } from '../ads/NativeAdCard';
import { PhotoCard, type PhotoCardRef, type SwipeIndicatorConfig } from './PhotoCard';
import type { DeckItem } from './types';
import {
  CARD_OPACITY_STEP,
  CARD_SCALE_RATIO,
  CARD_STACK_SPACING_PX,
  STACK_REVEAL_DISTANCE,
} from '../../libs/services/rate/swipe-animation';
import type { DeckSlot } from '../../libs/services/rate/swipe-deck-window';

export type SwipeDeckCardRef = PhotoCardRef | NativeAdCardRef;

interface Props {
  item: DeckItem;
  slot: DeckSlot;
  /** Active top-card translation (px). Drives next/third interpolation. */
  topTranslationX: SharedValue<number>;
  /** Index into the parent items[]. Forwarded to PhotoCard for diagnostics only. */
  index: number;
  /** Wrapper padding from the parent screen (header/bottom safe zones). */
  containerStyle?: ViewStyle;
  /** Notify when the card commits a swipe — same contract as PhotoCard.onSwipe. */
  onSwipe: (direction: 'left' | 'right') => void;
  /** Tap handler — only honored for the top photo card. */
  onPress?: () => void;
  /** Right/left swipe indicators — forwarded to PhotoCard so the gesture
   * preview matches the screen's action buttons. */
  rightIndicator?: SwipeIndicatorConfig;
  leftIndicator?: SwipeIndicatorConfig;
  ref?: Ref<SwipeDeckCardRef>;
}

// Per-slot stack offset table. Values stay in sync with the original
// CardWrapper math: scale 1 → 0.95 → 0.90, translateY 0 → 10 → 20,
// opacity 1 → 0.85 → 0.70. Outgoing keeps identity so the card's own
// fly-out spring carries it off-screen unimpeded.
const SLOT_BASE: Record<
  DeckSlot,
  { scale: number; translateY: number; opacity: number; zIndex: number }
> = {
  outgoing: { scale: 1, translateY: 0, opacity: 1, zIndex: 101 },
  top: { scale: 1, translateY: 0, opacity: 1, zIndex: 100 },
  next: {
    scale: 1 - CARD_SCALE_RATIO,
    translateY: CARD_STACK_SPACING_PX,
    opacity: 1 - CARD_OPACITY_STEP,
    zIndex: 99,
  },
  third: {
    scale: 1 - 2 * CARD_SCALE_RATIO,
    translateY: 2 * CARD_STACK_SPACING_PX,
    opacity: 1 - 2 * CARD_OPACITY_STEP,
    zIndex: 98,
  },
};

// Slot the entry advances toward as the top card is dragged out. `top` and
// `outgoing` don't visually advance — their inner card handles the gesture
// translate/rotate, and the wrapper stays at its base.
const SLOT_AHEAD: Record<DeckSlot, DeckSlot> = {
  outgoing: 'outgoing',
  top: 'top',
  next: 'top',
  third: 'next',
};

export function SwipeDeckCard({
  item,
  slot,
  topTranslationX,
  index,
  containerStyle,
  onSwipe,
  onPress,
  rightIndicator,
  leftIndicator,
  ref,
}: Props) {
  const isTop = slot === 'top';

  // 0..1 progress of the top card sliding toward commit. Background slots
  // interpolate toward the next slot ahead using a slight ease-in curve so
  // the "pop" reads as deliberate rather than linear.
  const dragProgress = useDerivedValue(() => {
    const raw = Math.min(Math.abs(topTranslationX.value) / STACK_REVEAL_DISTANCE, 1);
    return raw * raw;
  });

  const base = SLOT_BASE[slot];
  const aheadKey = SLOT_AHEAD[slot];
  const ahead = SLOT_BASE[aheadKey];
  const interpolating = slot !== aheadKey;

  const animatedStyle = useAnimatedStyle(() => {
    if (!interpolating) {
      return {
        zIndex: base.zIndex,
        opacity: base.opacity,
        transform: [{ scale: base.scale }, { translateY: base.translateY }],
      };
    }
    const progress = dragProgress.value;
    return {
      zIndex: base.zIndex,
      opacity: interpolate(progress, [0, 1], [base.opacity, ahead.opacity], Extrapolation.CLAMP),
      transform: [
        {
          scale: interpolate(progress, [0, 1], [base.scale, ahead.scale], Extrapolation.CLAMP),
        },
        {
          translateY: interpolate(
            progress,
            [0, 1],
            [base.translateY, ahead.translateY],
            Extrapolation.CLAMP
          ),
        },
      ],
    };
  });

  // Only the top card writes to topTranslationX. Wiring it for background
  // slots would let stale animations bleed into the next swipe.
  const activeTranslation = isTop ? topTranslationX : undefined;

  return (
    <Animated.View
      style={[styles.wrapper, containerStyle, animatedStyle]}
      pointerEvents={isTop ? 'auto' : 'none'}>
      {item.kind === 'photo' ? (
        <PhotoCard
          ref={ref as React.RefObject<PhotoCardRef>}
          photo={item.photo}
          index={index}
          isTop={isTop}
          onSwipe={onSwipe}
          onPress={onPress}
          activeTranslation={activeTranslation}
          rightIndicator={rightIndicator}
          leftIndicator={leftIndicator}
        />
      ) : (
        <NativeAdCard
          ref={ref as React.RefObject<NativeAdCardRef>}
          isTop={isTop}
          onSwipe={onSwipe}
          activeTranslation={activeTranslation}
        />
      )}
    </Animated.View>
  );
}

SwipeDeckCard.displayName = 'SwipeDeckCard';

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    width: '100%',
    height: '100%',
  },
});
