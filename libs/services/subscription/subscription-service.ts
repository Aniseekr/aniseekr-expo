import { Platform } from 'react-native';

export type EntitlementId = 'pro';

export interface SubscriptionOfferingPackage {
  identifier: string;
  packageType: string;
  productIdentifier: string;
  priceString: string;
  product?: {
    title?: string;
    description?: string;
    priceString?: string;
  };
}

export interface SubscriptionOffering {
  identifier: string;
  serverDescription?: string;
  monthly?: SubscriptionOfferingPackage | null;
  annual?: SubscriptionOfferingPackage | null;
  lifetime?: SubscriptionOfferingPackage | null;
  availablePackages: SubscriptionOfferingPackage[];
}

export interface SubscriptionState {
  isPro: boolean;
  activeEntitlements: string[];
  expiresAt?: number;
  willRenew?: boolean;
  productIdentifier?: string;
  unsupported: boolean;
}

export const ANONYMOUS_STATE: SubscriptionState = {
  isPro: false,
  activeEntitlements: [],
  unsupported: false,
};

const RC_KEY_IOS = process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY ?? '';
const RC_KEY_ANDROID = process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY ?? '';

interface PurchasesModule {
  default: {
    configure: (options: { apiKey: string; appUserID?: string }) => void;
    getOfferings: () => Promise<unknown>;
    getCustomerInfo: () => Promise<unknown>;
    purchasePackage: (pkg: unknown) => Promise<{ customerInfo: unknown }>;
    restorePurchases: () => Promise<unknown>;
    addCustomerInfoUpdateListener: (listener: (info: unknown) => void) => void;
    removeCustomerInfoUpdateListener: (listener: (info: unknown) => void) => void;
    logIn: (uid: string) => Promise<{ customerInfo: unknown }>;
    logOut: () => Promise<unknown>;
    setLogLevel: (level: string) => void;
  };
  LOG_LEVEL: { DEBUG: string; INFO: string; WARN: string; ERROR: string };
}

let modulePromise: Promise<PurchasesModule | null> | null = null;
async function loadPurchases(): Promise<PurchasesModule | null> {
  if (modulePromise) return modulePromise;
  modulePromise = (async () => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const mod = require('react-native-purchases') as PurchasesModule;
      return mod;
    } catch (error) {
      console.warn('[subscription] react-native-purchases unavailable', error);
      return null;
    }
  })();
  return modulePromise;
}

type Listener = (state: SubscriptionState) => void;

export class SubscriptionService {
  private static instance: SubscriptionService;
  private listeners = new Set<Listener>();
  private cached: SubscriptionState = ANONYMOUS_STATE;
  private configured = false;
  private updateHandler?: (info: unknown) => void;

  static getInstance(): SubscriptionService {
    if (!SubscriptionService.instance) {
      SubscriptionService.instance = new SubscriptionService();
    }
    return SubscriptionService.instance;
  }

  async configure(appUserID?: string): Promise<void> {
    const mod = await loadPurchases();
    if (!mod) {
      this.cached = { ...ANONYMOUS_STATE, unsupported: true };
      this.notify();
      return;
    }
    if (this.configured) return;

    const apiKey = Platform.OS === 'ios' ? RC_KEY_IOS : RC_KEY_ANDROID;
    if (!apiKey) {
      this.cached = { ...ANONYMOUS_STATE, unsupported: true };
      this.notify();
      return;
    }

    mod.default.setLogLevel(__DEV__ ? mod.LOG_LEVEL.DEBUG : mod.LOG_LEVEL.WARN);
    mod.default.configure({ apiKey, appUserID });
    this.configured = true;

    this.updateHandler = (info: unknown) => {
      this.cached = mapCustomerInfoToState(info);
      this.notify();
    };
    mod.default.addCustomerInfoUpdateListener(this.updateHandler);
    await this.refresh();
  }

  async refresh(): Promise<SubscriptionState> {
    const mod = await loadPurchases();
    if (!mod || !this.configured) return this.cached;
    try {
      const info = await mod.default.getCustomerInfo();
      this.cached = mapCustomerInfoToState(info);
      this.notify();
    } catch (error) {
      console.error('[subscription] refresh failed', error);
    }
    return this.cached;
  }

  async listOfferings(): Promise<SubscriptionOffering[]> {
    const mod = await loadPurchases();
    if (!mod || !this.configured) return [];
    try {
      const raw = await mod.default.getOfferings();
      return mapOfferings(raw);
    } catch (error) {
      console.error('[subscription] offerings failed', error);
      return [];
    }
  }

  async purchase(pkg: SubscriptionOfferingPackage | unknown): Promise<SubscriptionState> {
    const mod = await loadPurchases();
    if (!mod || !this.configured) {
      throw new Error('Subscription service not available');
    }
    const result = await mod.default.purchasePackage(pkg);
    this.cached = mapCustomerInfoToState(result.customerInfo);
    this.notify();
    return this.cached;
  }

  async restore(): Promise<SubscriptionState> {
    const mod = await loadPurchases();
    if (!mod || !this.configured) return this.cached;
    const info = await mod.default.restorePurchases();
    this.cached = mapCustomerInfoToState(info);
    this.notify();
    return this.cached;
  }

  async identify(appUserID: string): Promise<SubscriptionState> {
    const mod = await loadPurchases();
    if (!mod || !this.configured) return this.cached;
    const result = await mod.default.logIn(appUserID);
    this.cached = mapCustomerInfoToState(result.customerInfo);
    this.notify();
    return this.cached;
  }

  async signOut(): Promise<SubscriptionState> {
    const mod = await loadPurchases();
    if (!mod || !this.configured) return this.cached;
    const info = await mod.default.logOut();
    this.cached = mapCustomerInfoToState(info);
    this.notify();
    return this.cached;
  }

  getState(): SubscriptionState {
    return this.cached;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.cached);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    const snapshot = this.cached;
    this.listeners.forEach((listener) => listener(snapshot));
  }
}

function mapCustomerInfoToState(info: unknown): SubscriptionState {
  if (!info || typeof info !== 'object') {
    return ANONYMOUS_STATE;
  }
  const record = info as {
    entitlements?: {
      active?: Record<
        string,
        {
          identifier: string;
          isActive: boolean;
          willRenew: boolean;
          expirationDate: string | null;
          productIdentifier: string;
        }
      >;
    };
  };
  const active = record.entitlements?.active ?? {};
  const ids = Object.keys(active);
  const proEntitlement = active['pro'];

  return {
    isPro: ids.length > 0,
    activeEntitlements: ids,
    willRenew: proEntitlement?.willRenew ?? false,
    productIdentifier: proEntitlement?.productIdentifier,
    expiresAt: proEntitlement?.expirationDate
      ? new Date(proEntitlement.expirationDate).getTime()
      : undefined,
    unsupported: false,
  };
}

function mapOfferings(raw: unknown): SubscriptionOffering[] {
  if (!raw || typeof raw !== 'object') return [];
  const offerings = raw as {
    all?: Record<string, RawOffering>;
    current?: RawOffering | null;
  };
  const all = Object.values(offerings.all ?? {});
  const list = all.length > 0 ? all : offerings.current ? [offerings.current] : [];
  return list
    .filter((o): o is RawOffering => Boolean(o))
    .map((offering) => ({
      identifier: offering.identifier,
      serverDescription: offering.serverDescription,
      monthly: mapPackage(offering.monthly),
      annual: mapPackage(offering.annual),
      lifetime: mapPackage(offering.lifetime),
      availablePackages: (offering.availablePackages ?? [])
        .map(mapPackage)
        .filter((p): p is SubscriptionOfferingPackage => Boolean(p)),
    }));
}

interface RawOffering {
  identifier: string;
  serverDescription?: string;
  monthly?: RawPackage | null;
  annual?: RawPackage | null;
  lifetime?: RawPackage | null;
  availablePackages?: RawPackage[];
}

interface RawPackage {
  identifier: string;
  packageType: string;
  product?: {
    identifier: string;
    title?: string;
    description?: string;
    priceString?: string;
  };
}

function mapPackage(pkg?: RawPackage | null): SubscriptionOfferingPackage | null {
  if (!pkg) return null;
  return {
    identifier: pkg.identifier,
    packageType: pkg.packageType,
    productIdentifier: pkg.product?.identifier ?? pkg.identifier,
    priceString: pkg.product?.priceString ?? '',
    product: pkg.product
      ? {
          title: pkg.product.title,
          description: pkg.product.description,
          priceString: pkg.product.priceString,
        }
      : undefined,
  };
}

export const subscriptionService = SubscriptionService.getInstance();
