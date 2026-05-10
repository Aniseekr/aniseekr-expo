import { Logger } from '../utils/logger';

interface AsyncStorageLike {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem?(key: string): Promise<void>;
}

let AsyncStorage: AsyncStorageLike;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  AsyncStorage = require('@react-native-async-storage/async-storage').default;
} catch {
  const memoryStorage = new Map<string, string>();
  AsyncStorage = {
    getItem: async (k: string) => memoryStorage.get(k) ?? null,
    setItem: async (k: string, v: string) => {
      memoryStorage.set(k, v);
    },
    removeItem: async (k: string) => {
      memoryStorage.delete(k);
    },
  };
}

export const ONBOARDING_COMPLETE_KEY = 'aniseekr.onboarding.complete.v1';

export async function isOnboardingComplete(): Promise<boolean> {
  try {
    const raw = await AsyncStorage.getItem(ONBOARDING_COMPLETE_KEY);
    return raw === 'true';
  } catch (err) {
    Logger.warn('[Onboarding] read flag failed', err);
    return false;
  }
}

export async function markOnboardingComplete(): Promise<void> {
  try {
    await AsyncStorage.setItem(ONBOARDING_COMPLETE_KEY, 'true');
  } catch (err) {
    Logger.warn('[Onboarding] write flag failed', err);
  }
}

export async function resetOnboarding(): Promise<void> {
  try {
    await AsyncStorage.removeItem?.(ONBOARDING_COMPLETE_KEY);
  } catch (err) {
    Logger.warn('[Onboarding] reset flag failed', err);
  }
}
