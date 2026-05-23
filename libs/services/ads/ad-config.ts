/**
 * Centralized AdMob slot guard — JS analogue of Swift `#if AD_SLOT_X`.
 * `getAdUnitId(slot)` is the single source of truth: every ad surface
 * MUST guard with `if (!id) return null;`. Set `EXPO_PUBLIC_ADS_DISABLED=1`
 * for a hard kill switch (screenshots, App Store review, dev work).
 * In dev we fall back to Google's documented test IDs.
 *
 * NPA-only posture: we never call `requestTrackingAuthorization` (no ATT
 * prompt) and `app.json` declares `NSPrivacyTracking: false`. To keep AdMob
 * consistent with that declaration, every ad request MUST spread
 * `NPA_REQUEST_OPTIONS` so Google serves non-personalized ads and does not
 * read IDFA. Do not introduce a personalized path without also flipping
 * `NSPrivacyTracking` and adding `NSUserTrackingUsageDescription`.
 */
import { Platform } from 'react-native';

export type AdSlot = 'home_banner' | 'detail_banner' | 'rate_native' | 'interstitial' | 'rewarded';

export const NPA_REQUEST_OPTIONS = Object.freeze({
  requestNonPersonalizedAdsOnly: true,
});

const TEST_IDS: Partial<Record<AdSlot, string>> = {
  home_banner: 'ca-app-pub-3940256099942544/6300978111',
  detail_banner: 'ca-app-pub-3940256099942544/6300978111',
  rate_native: 'ca-app-pub-3940256099942544/6300978111',
  interstitial: 'ca-app-pub-3940256099942544/1033173712',
  rewarded: 'ca-app-pub-3940256099942544/5224354917',
};

export function getAdUnitId(slot: AdSlot): string | null {
  if (process.env.EXPO_PUBLIC_ADS_DISABLED === '1') return null;
  if (Platform.OS === 'web') return null;
  if (__DEV__) return TEST_IDS[slot] ?? null;
  return resolveProdId(slot);
}

export function isAdSlotEnabled(slot: AdSlot): boolean {
  return getAdUnitId(slot) !== null;
}

function resolveProdId(slot: AdSlot): string | null {
  const ios = Platform.OS === 'ios';
  switch (slot) {
    case 'home_banner':
    case 'detail_banner':
      return (
        (ios
          ? process.env.EXPO_PUBLIC_ADMOB_IOS_BANNER
          : process.env.EXPO_PUBLIC_ADMOB_ANDROID_BANNER) ?? null
      );
    case 'rate_native':
      return (
        (ios
          ? (process.env.EXPO_PUBLIC_ADMOB_IOS_NATIVE ?? process.env.EXPO_PUBLIC_ADMOB_IOS_BANNER)
          : (process.env.EXPO_PUBLIC_ADMOB_ANDROID_NATIVE ??
            process.env.EXPO_PUBLIC_ADMOB_ANDROID_BANNER)) ?? null
      );
    case 'interstitial':
      return (
        (ios
          ? process.env.EXPO_PUBLIC_ADMOB_IOS_INTERSTITIAL
          : process.env.EXPO_PUBLIC_ADMOB_ANDROID_INTERSTITIAL) ?? null
      );
    case 'rewarded':
      return (
        (ios
          ? process.env.EXPO_PUBLIC_ADMOB_IOS_REWARDED
          : process.env.EXPO_PUBLIC_ADMOB_ANDROID_REWARDED) ?? null
      );
  }
}
