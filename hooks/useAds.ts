import { useCallback } from 'react';
import { adsService } from '../libs/services/ads/ads-service';
import { useSubscription } from '../context/SubscriptionContext';

export interface UseAdsResult {
  isSuppressed: boolean;
  showInterstitial: () => Promise<boolean>;
  showRewarded: (
    onReward: (reward: { type: string; amount: number }) => void
  ) => Promise<boolean>;
  preloadInterstitial: () => Promise<void>;
  preloadRewarded: () => Promise<void>;
}

export function useAds(): UseAdsResult {
  const { isPro } = useSubscription();

  const showInterstitial = useCallback(async () => {
    if (isPro) return false;
    return adsService.showInterstitial();
  }, [isPro]);

  const showRewarded = useCallback(
    async (onReward: (reward: { type: string; amount: number }) => void) => {
      if (isPro) return false;
      return adsService.showRewarded(onReward);
    },
    [isPro]
  );

  const preloadInterstitial = useCallback(async () => {
    if (isPro) return;
    await adsService.preloadInterstitial();
  }, [isPro]);

  const preloadRewarded = useCallback(async () => {
    if (isPro) return;
    await adsService.preloadRewarded();
  }, [isPro]);

  return {
    isSuppressed: isPro,
    showInterstitial,
    showRewarded,
    preloadInterstitial,
    preloadRewarded,
  };
}
