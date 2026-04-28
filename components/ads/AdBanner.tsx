import { ReactElement, useEffect, useState } from 'react';
import { View } from 'react-native';
import { adsService } from '../../libs/services/ads/ads-service';
import { useSubscription } from '../../context/SubscriptionContext';

type BannerProps = {
  unitId: string;
  size: string;
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
  const [unitId, setUnitId] = useState<string | null>(null);
  const [errored, setErrored] = useState(false);

  useEffect(() => {
    if (subscription.isPro) {
      setUnitId(null);
      return;
    }
    let mounted = true;
    adsService.getBannerUnitId(slot).then((id) => {
      if (mounted) setUnitId(id);
    });
    return () => {
      mounted = false;
    };
  }, [subscription.isPro, slot]);

  if (subscription.isPro) return null;
  if (!unitId || !BannerAdComponent || !BannerSize || errored) {
    return fallbackHeight > 0 ? <View style={{ height: fallbackHeight }} /> : null;
  }

  return (
    <View>
      <BannerAdComponent
        unitId={unitId}
        size={BannerSize.ANCHORED_ADAPTIVE_BANNER ?? BannerSize.BANNER ?? 'BANNER'}
        onAdFailedToLoad={() => setErrored(true)}
      />
    </View>
  );
}
