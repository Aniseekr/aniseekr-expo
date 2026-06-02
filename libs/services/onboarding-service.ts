import { kvGet, kvSet } from './storage/app-storage';
import { ONBOARDING_COMPLETE_KEY } from './storage/keys';
import { Logger } from '../utils/logger';

/**
 * Synchronous MMKV read. Safe for first-frame `useState` initialisers so the
 * router can gate the tabs vs. onboarding screen without a transient flash.
 */
export function isOnboardingCompleteSync(): boolean {
  try {
    return kvGet(ONBOARDING_COMPLETE_KEY) === 'true';
  } catch (err) {
    Logger.warn('[Onboarding] read flag failed', err);
    return false;
  }
}

export async function markOnboardingComplete(): Promise<void> {
  try {
    kvSet(ONBOARDING_COMPLETE_KEY, 'true');
  } catch (err) {
    Logger.warn('[Onboarding] write flag failed', err);
  }
}
