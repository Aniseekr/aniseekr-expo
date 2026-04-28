import { Platform } from 'react-native';

export type AdSlot = 'home_banner' | 'detail_banner' | 'interstitial' | 'rewarded';

export interface AdConfig {
  iosBanner?: string;
  androidBanner?: string;
  iosInterstitial?: string;
  androidInterstitial?: string;
  iosRewarded?: string;
  androidRewarded?: string;
}

const ENV_CONFIG: AdConfig = {
  iosBanner: process.env.EXPO_PUBLIC_ADMOB_IOS_BANNER,
  androidBanner: process.env.EXPO_PUBLIC_ADMOB_ANDROID_BANNER,
  iosInterstitial: process.env.EXPO_PUBLIC_ADMOB_IOS_INTERSTITIAL,
  androidInterstitial: process.env.EXPO_PUBLIC_ADMOB_ANDROID_INTERSTITIAL,
  iosRewarded: process.env.EXPO_PUBLIC_ADMOB_IOS_REWARDED,
  androidRewarded: process.env.EXPO_PUBLIC_ADMOB_ANDROID_REWARDED,
};

interface AdsModule {
  default: { initialize: () => Promise<unknown> };
  TestIds: { BANNER: string; INTERSTITIAL: string; REWARDED: string };
  InterstitialAd: { createForAdRequest: (unitId: string) => InterstitialController };
  RewardedAd: { createForAdRequest: (unitId: string) => RewardedController };
  AdEventType: { LOADED: string; ERROR: string; CLOSED: string };
  RewardedAdEventType: { LOADED: string; EARNED_REWARD: string };
  AdsConsent: {
    requestInfoUpdate: () => Promise<unknown>;
    showForm: () => Promise<unknown>;
    getConsentInfo: () => Promise<{ isConsentFormAvailable?: boolean }>;
  };
}

interface InterstitialController {
  load: () => void;
  show: () => Promise<void>;
  addAdEventListener: (event: string, listener: () => void) => () => void;
}

interface RewardedController extends InterstitialController {
  addAdEventListener: (event: string, listener: (...args: unknown[]) => void) => () => void;
}

let modulePromise: Promise<AdsModule | null> | null = null;
async function loadAdsModule(): Promise<AdsModule | null> {
  if (modulePromise) return modulePromise;
  modulePromise = (async () => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      return require('react-native-google-mobile-ads') as AdsModule;
    } catch (error) {
      console.warn('[ads] react-native-google-mobile-ads unavailable', error);
      return null;
    }
  })();
  return modulePromise;
}

export class AdsService {
  private static instance: AdsService;
  private initialized = false;
  private interstitial?: InterstitialController;
  private interstitialReady = false;
  private rewarded?: RewardedController;
  private rewardedReady = false;
  private suppressed = false;

  static getInstance(): AdsService {
    if (!AdsService.instance) {
      AdsService.instance = new AdsService();
    }
    return AdsService.instance;
  }

  setSuppressed(value: boolean): void {
    this.suppressed = value;
  }

  isSuppressed(): boolean {
    return this.suppressed;
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    const mod = await loadAdsModule();
    if (!mod) return;

    try {
      await mod.default.initialize();
      try {
        const info = await mod.AdsConsent.requestInfoUpdate();
        if ((info as { isConsentFormAvailable?: boolean })?.isConsentFormAvailable) {
          await mod.AdsConsent.showForm();
        }
      } catch (consentError) {
        console.warn('[ads] consent flow failed', consentError);
      }
      this.initialized = true;
    } catch (error) {
      console.error('[ads] initialize failed', error);
    }
  }

  async getBannerUnitId(
    slot: 'home_banner' | 'detail_banner' = 'home_banner'
  ): Promise<string | null> {
    if (this.suppressed) return null;
    const mod = await loadAdsModule();
    if (!mod) return null;
    if (__DEV__) return mod.TestIds.BANNER;
    if (Platform.OS === 'ios') return ENV_CONFIG.iosBanner ?? null;
    if (Platform.OS === 'android') return ENV_CONFIG.androidBanner ?? null;
    void slot;
    return null;
  }

  async preloadInterstitial(): Promise<void> {
    if (this.suppressed) return;
    const mod = await loadAdsModule();
    if (!mod) return;
    if (this.interstitial && this.interstitialReady) return;

    const unitId = this.resolveUnitId(mod.TestIds.INTERSTITIAL, 'interstitial');
    if (!unitId) return;

    const controller = mod.InterstitialAd.createForAdRequest(unitId);
    controller.addAdEventListener(mod.AdEventType.LOADED, () => {
      this.interstitialReady = true;
    });
    controller.addAdEventListener(mod.AdEventType.CLOSED, () => {
      this.interstitialReady = false;
      controller.load();
    });
    controller.addAdEventListener(mod.AdEventType.ERROR, () => {
      this.interstitialReady = false;
    });
    this.interstitial = controller;
    controller.load();
  }

  async showInterstitial(): Promise<boolean> {
    if (this.suppressed) return false;
    if (!this.interstitial) {
      await this.preloadInterstitial();
    }
    if (!this.interstitial || !this.interstitialReady) return false;
    try {
      await this.interstitial.show();
      return true;
    } catch (error) {
      console.warn('[ads] show interstitial failed', error);
      return false;
    }
  }

  async preloadRewarded(): Promise<void> {
    if (this.suppressed) return;
    const mod = await loadAdsModule();
    if (!mod) return;
    if (this.rewarded && this.rewardedReady) return;

    const unitId = this.resolveUnitId(mod.TestIds.REWARDED, 'rewarded');
    if (!unitId) return;

    const controller = mod.RewardedAd.createForAdRequest(unitId);
    controller.addAdEventListener(mod.RewardedAdEventType.LOADED, () => {
      this.rewardedReady = true;
    });
    controller.addAdEventListener(mod.AdEventType.CLOSED, () => {
      this.rewardedReady = false;
      controller.load();
    });
    controller.addAdEventListener(mod.AdEventType.ERROR, () => {
      this.rewardedReady = false;
    });
    this.rewarded = controller;
    controller.load();
  }

  async showRewarded(
    onReward: (reward: { type: string; amount: number }) => void
  ): Promise<boolean> {
    if (this.suppressed) return false;
    const mod = await loadAdsModule();
    if (!mod) return false;
    if (!this.rewarded) {
      await this.preloadRewarded();
    }
    if (!this.rewarded || !this.rewardedReady) return false;

    let received = false;
    const cleanup = this.rewarded.addAdEventListener(
      mod.RewardedAdEventType.EARNED_REWARD,
      (...args: unknown[]) => {
        const reward = args[0] as { type?: string; amount?: number };
        if (!received) {
          received = true;
          onReward({ type: reward?.type ?? 'reward', amount: reward?.amount ?? 0 });
        }
      }
    );

    try {
      await this.rewarded.show();
      return received;
    } catch (error) {
      console.warn('[ads] show rewarded failed', error);
      return false;
    } finally {
      cleanup();
    }
  }

  private resolveUnitId(testFallback: string, kind: 'interstitial' | 'rewarded'): string | null {
    if (__DEV__) return testFallback;
    if (Platform.OS === 'ios') {
      return kind === 'interstitial'
        ? (ENV_CONFIG.iosInterstitial ?? null)
        : (ENV_CONFIG.iosRewarded ?? null);
    }
    if (Platform.OS === 'android') {
      return kind === 'interstitial'
        ? (ENV_CONFIG.androidInterstitial ?? null)
        : (ENV_CONFIG.androidRewarded ?? null);
    }
    return null;
  }
}

export const adsService = AdsService.getInstance();
