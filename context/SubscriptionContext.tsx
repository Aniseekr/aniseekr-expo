import { createContext, ReactNode, use, useCallback, useEffect, useMemo, useState } from 'react';
import {
  ANONYMOUS_STATE,
  subscriptionService,
  SubscriptionOffering,
  SubscriptionOfferingPackage,
  SubscriptionState,
} from '../libs/services/subscription/subscription-service';
import { FeatureFlags } from '../constants/FeatureFlags';

interface SubscriptionContextValue extends SubscriptionState {
  offerings: SubscriptionOffering[];
  loading: boolean;
  refresh: () => Promise<void>;
  purchase: (pkg: SubscriptionOfferingPackage) => Promise<SubscriptionState>;
  restore: () => Promise<SubscriptionState>;
  identify: (uid: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const SubscriptionContext = createContext<SubscriptionContextValue | undefined>(undefined);

export function SubscriptionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SubscriptionState>(ANONYMOUS_STATE);
  const [offerings, setOfferings] = useState<SubscriptionOffering[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    const next = await subscriptionService.refresh();
    setState(next);
    if (!next.unsupported) {
      const list = await subscriptionService.listOfferings();
      setOfferings(list);
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      await subscriptionService.configure();
      if (!mounted) return;
      await reload();
      if (!mounted) return;
      setLoading(false);
    })().catch((error) => {
      console.error('[subscription] init failed', error);
      if (mounted) setLoading(false);
    });

    const unsub = subscriptionService.subscribe((next) => {
      if (mounted) setState(next);
    });

    return () => {
      mounted = false;
      unsub();
    };
  }, [reload]);

  const purchase = useCallback(async (pkg: SubscriptionOfferingPackage) => {
    return subscriptionService.purchase(pkg);
  }, []);

  const restore = useCallback(() => subscriptionService.restore(), []);

  const identify = useCallback(async (uid: string) => {
    await subscriptionService.identify(uid);
  }, []);

  const signOut = useCallback(async () => {
    await subscriptionService.signOut();
  }, []);

  const value = useMemo<SubscriptionContextValue>(
    () => ({
      ...state,
      offerings,
      loading,
      refresh: reload,
      purchase,
      restore,
      identify,
      signOut,
    }),
    [state, offerings, loading, reload, purchase, restore, identify, signOut]
  );

  return <SubscriptionContext.Provider value={value}>{children}</SubscriptionContext.Provider>;
}

export function useSubscription(): SubscriptionContextValue {
  const ctx = use(SubscriptionContext);
  const base: SubscriptionContextValue = ctx ?? {
    ...ANONYMOUS_STATE,
    offerings: [],
    loading: false,
    refresh: async () => undefined,
    purchase: async () => ANONYMOUS_STATE,
    restore: async () => ANONYMOUS_STATE,
    identify: async () => undefined,
    signOut: async () => undefined,
  };
  // Free-version posture: treat everyone as Pro so isPro-gated features
  // (premium themes, no-ads cascade) auto-unlock. See FeatureFlags.ts.
  if (!FeatureFlags.PREMIUM_ENABLED) {
    return { ...base, isPro: true };
  }
  return base;
}
