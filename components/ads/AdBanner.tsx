import { ReactElement, useState } from 'react';
import { View } from 'react-native';
import { NPA_REQUEST_OPTIONS, getAdUnitId } from '../../libs/services/ads/ad-config';
import { useSubscription } from '../../context/SubscriptionContext';

type BannerProps = {
  unitId: string;
  size: string;
  requestOptions?: { requestNonPersonalizedAdsOnly?: boolean };
  onAdFailedToLoad?: (e: unknown) => void;
};

let BannerAdComponent: ((props: BannerProps) => ReactElement) | null = null;
let BannerSize: { ANCHORED_ADAPTIVE_BANNER?: string; BANNER?: string } | null = null;

try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require('react-native-google-mobile-ads');
  BannerAdComponent = mod.BannerAd;
  BannerSize = mod.BannerAdSize;
} catch {
  BannerAdComponent = null;
}

export interface AdBannerProps {
  slot?: 'home_banner' | 'detail_banner';
  fallbackHeight?: number;
}

export function AdBanner({ slot = 'home_banner', fallbackHeight = 0 }: AdBannerProps) {
  const subscription = useSubscription();
  const [errored, setErrored] = useState(false);

  const unitId = subscription.isPro ? null : getAdUnitId(slot);

  if (!unitId || !BannerAdComponent || !BannerSize || errored) {
    return fallbackHeight > 0 ? <View style={{ height: fallbackHeight }} /> : null;
  }

  return (
    <View>
      <BannerAdComponent
        unitId={unitId}
        size={BannerSize.ANCHORED_ADAPTIVE_BANNER ?? BannerSize.BANNER ?? 'BANNER'}
        requestOptions={NPA_REQUEST_OPTIONS}
        onAdFailedToLoad={() => setErrored(true)}
      />
    </View>
  );
}
