import {
  ComponentType,
  ReactElement,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type Ref,
} from 'react';
import { ActivityIndicator, Dimensions, Image, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { NPA_REQUEST_OPTIONS, getAdUnitId } from '../../libs/services/ads/ad-config';
import {
  RATE_NATIVE_AD_LOAD_TIMEOUT_MS,
  RATE_NATIVE_AD_PROGRESS_MS,
  isRateNativeAdSuppressedSync,
  suppressRateNativeAdsTemporarily,
  type RateNativeAdSuppressionReason,
} from '../../libs/services/ads/rate-native-ad-session';
import { useSubscription } from '../../context/SubscriptionContext';
import { Colors, Radius, Spacing, Typography } from '../../constants/DesignSystem';
import {
  getStackRevealTranslation,
  STACK_REVEAL_DISTANCE,
  runSwipeHandoff,
} from '../../libs/services/rate/swipe-animation';

type NativeAdImage = {
  url: string;
  scale?: number;
};

type NativeAdLike = {
  destroy: () => void;
  advertiser: string | null;
  body: string;
  callToAction: string;
  headline: string;
  icon: NativeAdImage | null;
  mediaContent?: { aspectRatio?: number } | null;
};

type NativeAdRequestOptions = {
  requestNonPersonalizedAdsOnly?: boolean;
  aspectRatio?: number;
  adChoicesPlacement?: number;
  startVideoMuted?: boolean;
};

type NativeAdsModule = {
  NativeAd: {
    createForAdRequest: (
      unitId: string,
      requestOptions?: NativeAdRequestOptions
    ) => Promise<NativeAdLike>;
  };
  NativeAdView: ComponentType<{
    nativeAd: NativeAdLike;
    style?: unknown;
    children?: ReactElement | ReactElement[];
  }>;
  NativeMediaView: ComponentType<{ resizeMode?: 'cover' | 'contain' | 'stretch'; style?: unknown }>;
  NativeAsset: ComponentType<{ assetType: string; children: ReactElement }>;
  NativeAssetType: {
    ADVERTISER: string;
    BODY: string;
    CALL_TO_ACTION: string;
    HEADLINE: string;
    ICON: string;
  };
  NativeMediaAspectRatio?: { LANDSCAPE?: number };
  NativeAdChoicesPlacement?: { TOP_RIGHT?: number };
};

let NativeAds: NativeAdsModule | null = null;

try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require('react-native-google-mobile-ads');
  if (mod.NativeAd && mod.NativeAdView && mod.NativeMediaView && mod.NativeAsset) {
    NativeAds = mod as NativeAdsModule;
  }
} catch {
  NativeAds = null;
}

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const SWIPE_THRESHOLD = 120;
const VELOCITY_THRESHOLD = 800;
const AD_MEDIA_HEIGHT = 260;

const RESET_SPRING_CONFIG = {
  damping: 18,
  stiffness: 180,
  mass: 1,
  overshootClamping: true,
};

const NATIVE_AD_REQUEST_OPTIONS = Object.freeze({
  ...NPA_REQUEST_OPTIONS,
  aspectRatio: NativeAds?.NativeMediaAspectRatio?.LANDSCAPE,
  adChoicesPlacement: NativeAds?.NativeAdChoicesPlacement?.TOP_RIGHT,
  startVideoMuted: true,
});

export interface NativeAdCardRef {
  swipe: (direction: 'left' | 'right') => void;
}

interface Props {
  isTop: boolean;
  onSwipe: (direction: 'left' | 'right') => void;
  activeTranslation?: SharedValue<number>;
  ref?: Ref<NativeAdCardRef>;
}

export function NativeAdCard({ isTop, onSwipe, activeTranslation, ref }: Props) {
  const subscription = useSubscription();
  const [nativeAd, setNativeAd] = useState<NativeAdLike | null>(null);
  const [loading, setLoading] = useState(false);
  const [canDismiss, setCanDismiss] = useState(false);

  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const rotate = useSharedValue(0);
  const progress = useSharedValue(0);
  const nativeAdRef = useRef<NativeAdLike | null>(null);
  const handledUnavailableRef = useRef(false);
  const unavailableHandoffRef = useRef(false);
  const canDismissRef = useRef(false);
  const isTopRef = useRef(isTop);
  const requestStartedRef = useRef(false);
  const progressStartedRef = useRef(false);

  useEffect(() => {
    isTopRef.current = isTop;
  }, [isTop]);

  useEffect(() => {
    canDismissRef.current = canDismiss;
  }, [canDismiss]);

  const handOffSwipe = useCallback(
    (direction: 'left' | 'right') => {
      runSwipeHandoff(direction, onSwipe);
    },
    [onSwipe]
  );

  const flingOut = useCallback(
    (direction: 'left' | 'right', velocityX: number) => {
      if (!canDismissRef.current) return;
      const targetX = direction === 'right' ? SCREEN_WIDTH * 1.5 : -SCREEN_WIDTH * 1.5;
      translateX.value = withSpring(targetX, {
        velocity: velocityX,
        damping: 20,
        stiffness: 120,
        overshootClamping: true,
      });
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
    },
    [activeTranslation, handOffSwipe, rotate, translateX, translateY]
  );

  useImperativeHandle(
    ref,
    () => ({
      swipe: (direction: 'left' | 'right') => {
        if (!canDismissRef.current) return;
        const syntheticVelocity = direction === 'right' ? 2000 : -2000;
        flingOut(direction, syntheticVelocity);
      },
    }),
    [flingOut]
  );

  const skipUnavailableAd = useCallback(
    (
      reason: Exclude<
        RateNativeAdSuppressionReason,
        'persisted-cooldown' | 'pro-user' | 'missing-unit'
      >
    ) => {
      if (!handledUnavailableRef.current) {
        handledUnavailableRef.current = true;
        suppressRateNativeAdsTemporarily(reason);
      }
      if (!isTopRef.current || unavailableHandoffRef.current) return;
      unavailableHandoffRef.current = true;
      runSwipeHandoff('left', onSwipe);
    },
    [onSwipe]
  );

  const skipNonRequestableAd = useCallback(() => {
    handledUnavailableRef.current = true;
    if (!isTopRef.current || unavailableHandoffRef.current) return;
    unavailableHandoffRef.current = true;
    runSwipeHandoff('left', onSwipe);
  }, [onSwipe]);

  const markDismissible = useCallback(() => {
    if (!isTopRef.current) return;
    setCanDismiss(true);
    canDismissRef.current = true;
    flingOut('left', -2000);
  }, [flingOut]);

  useEffect(() => {
    if (subscription.isPro || isRateNativeAdSuppressedSync()) {
      skipNonRequestableAd();
      return;
    }

    const unitId = getAdUnitId('rate_native');
    if (!unitId) {
      skipNonRequestableAd();
      return;
    }

    if (!NativeAds) {
      skipUnavailableAd('module-unavailable');
      return;
    }

    if (requestStartedRef.current || nativeAdRef.current || handledUnavailableRef.current) {
      return;
    }

    let cancelled = false;
    requestStartedRef.current = true;
    handledUnavailableRef.current = false;
    setLoading(true);
    setCanDismiss(false);
    canDismissRef.current = false;
    progress.value = 0;

    const timeout = setTimeout(() => {
      if (cancelled) return;
      setLoading(false);
      skipUnavailableAd('load-timeout');
    }, RATE_NATIVE_AD_LOAD_TIMEOUT_MS);

    NativeAds.NativeAd.createForAdRequest(unitId, NATIVE_AD_REQUEST_OPTIONS)
      .then((ad) => {
        if (cancelled) {
          ad.destroy();
          return;
        }
        clearTimeout(timeout);
        nativeAdRef.current?.destroy();
        nativeAdRef.current = ad;
        setNativeAd(ad);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        clearTimeout(timeout);
        setLoading(false);
        skipUnavailableAd('load-failed');
      });

    return () => {
      cancelled = true;
      requestStartedRef.current = false;
      clearTimeout(timeout);
    };
  }, [progress, skipNonRequestableAd, skipUnavailableAd, subscription.isPro]);

  useEffect(() => {
    if (!isTop) return;
    if (subscription.isPro || isRateNativeAdSuppressedSync() || !getAdUnitId('rate_native')) {
      skipNonRequestableAd();
      return;
    }
    if (!NativeAds) {
      skipUnavailableAd('module-unavailable');
    }
  }, [isTop, skipNonRequestableAd, skipUnavailableAd, subscription.isPro]);

  useEffect(() => {
    if (!isTop || !nativeAd || progressStartedRef.current) return;
    progressStartedRef.current = true;
    setCanDismiss(false);
    canDismissRef.current = false;
    progress.value = 0;
    progress.value = withTiming(1, { duration: RATE_NATIVE_AD_PROGRESS_MS }, (finished) => {
      if (finished) scheduleOnRN(markDismissible);
    });
  }, [isTop, markDismissible, nativeAd, progress]);

  useEffect(() => {
    return () => {
      nativeAdRef.current?.destroy();
      nativeAdRef.current = null;
    };
  }, []);

  const resetPosition = useCallback(() => {
    translateX.value = withSpring(0, RESET_SPRING_CONFIG);
    translateY.value = withSpring(0, RESET_SPRING_CONFIG);
    rotate.value = withSpring(0, RESET_SPRING_CONFIG);
    if (activeTranslation) {
      activeTranslation.value = withSpring(0, RESET_SPRING_CONFIG);
    }
  }, [activeTranslation, rotate, translateX, translateY]);

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .enabled(isTop && canDismiss)
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
    [
      isTop,
      canDismiss,
      activeTranslation,
      handOffSwipe,
      resetPosition,
      rotate,
      translateX,
      translateY,
    ]
  );

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { rotateZ: `${rotate.value}deg` },
    ],
  }));

  const progressStyle = useAnimatedStyle(() => ({
    width: `${Math.min(progress.value, 1) * 100}%`,
  }));

  const NativeAdView = NativeAds?.NativeAdView;
  const NativeMediaView = NativeAds?.NativeMediaView;
  const NativeAsset = NativeAds?.NativeAsset;
  const NativeAssetType = NativeAds?.NativeAssetType;
  const canRenderNativeAd =
    isTop && nativeAd && NativeAdView && NativeMediaView && NativeAsset && NativeAssetType;

  return (
    <View style={styles.container} pointerEvents={isTop ? 'auto' : 'none'}>
      <GestureDetector gesture={pan}>
        <Animated.View style={[styles.card, animatedStyle]}>
          <View style={styles.label}>
            <Text style={styles.labelText}>Ad</Text>
          </View>
          {canRenderNativeAd ? (
            <NativeAdView nativeAd={nativeAd} style={styles.nativeAdView}>
              <NativeMediaView resizeMode="cover" style={styles.media} />

              <View style={styles.content}>
                <View style={styles.headerRow}>
                  {nativeAd.icon ? (
                    <NativeAsset assetType={NativeAssetType.ICON}>
                      <Image source={{ uri: nativeAd.icon.url }} style={styles.icon} />
                    </NativeAsset>
                  ) : null}
                  <View style={styles.titleColumn}>
                    <NativeAsset assetType={NativeAssetType.HEADLINE}>
                      <Text style={styles.headline} numberOfLines={2}>
                        {nativeAd.headline}
                      </Text>
                    </NativeAsset>
                    {nativeAd.advertiser ? (
                      <NativeAsset assetType={NativeAssetType.ADVERTISER}>
                        <Text style={styles.advertiser} numberOfLines={1}>
                          {nativeAd.advertiser}
                        </Text>
                      </NativeAsset>
                    ) : (
                      <Text style={styles.advertiser}>Sponsored</Text>
                    )}
                  </View>
                </View>

                {nativeAd.body ? (
                  <NativeAsset assetType={NativeAssetType.BODY}>
                    <Text style={styles.bodyText} numberOfLines={3}>
                      {nativeAd.body}
                    </Text>
                  </NativeAsset>
                ) : null}

                {nativeAd.callToAction ? (
                  <NativeAsset assetType={NativeAssetType.CALL_TO_ACTION}>
                    <Text style={styles.ctaText} numberOfLines={1}>
                      {nativeAd.callToAction}
                    </Text>
                  </NativeAsset>
                ) : null}
              </View>
            </NativeAdView>
          ) : (
            <View style={styles.loadingState}>
              <ActivityIndicator size="small" color={Colors.text.primary} animating={loading} />
              <Text style={styles.loadingTitle}>Loading ad</Text>
            </View>
          )}

          {canRenderNativeAd ? (
            <View style={styles.dismissControls} pointerEvents="box-none">
              <View style={styles.progressTrack}>
                <Animated.View style={[styles.progressFill, progressStyle]} />
              </View>
              <Text style={styles.progressText}>Continue in a moment</Text>
            </View>
          ) : null}
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

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
  nativeAdView: {
    flex: 1,
    width: '100%',
  },
  media: {
    width: '100%',
    height: AD_MEDIA_HEIGHT,
    backgroundColor: Colors.background.tertiary,
  },
  content: {
    flex: 1,
    padding: Spacing.lg,
    gap: Spacing.md,
    justifyContent: 'center',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  icon: {
    width: 48,
    height: 48,
    borderRadius: Radius.md,
    backgroundColor: Colors.background.tertiary,
  },
  titleColumn: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  headline: {
    ...Typography.titleLarge,
    color: Colors.text.primary,
  },
  advertiser: {
    ...Typography.caption,
    color: Colors.text.secondary,
  },
  bodyText: {
    ...Typography.bodyMedium,
    color: Colors.text.secondary,
  },
  ctaText: {
    ...Typography.titleMedium,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.full,
    overflow: 'hidden',
    textAlign: 'center',
    textAlignVertical: 'center',
    color: Colors.background.primary,
    backgroundColor: Colors.text.primary,
  },
  loadingState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
  },
  loadingTitle: {
    ...Typography.bodyMedium,
    color: Colors.text.secondary,
  },
  dismissControls: {
    position: 'absolute',
    left: Spacing.lg,
    right: Spacing.lg,
    bottom: Spacing.lg,
    alignItems: 'center',
    gap: Spacing.sm,
  },
  progressTrack: {
    width: '100%',
    height: 4,
    borderRadius: Radius.full,
    overflow: 'hidden',
    backgroundColor: Colors.glass.medium,
  },
  progressFill: {
    height: '100%',
    borderRadius: Radius.full,
    backgroundColor: Colors.primary,
  },
  progressText: {
    ...Typography.caption,
    color: Colors.text.secondary,
  },
});
