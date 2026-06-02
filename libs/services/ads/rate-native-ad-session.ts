import { kvGet, kvRemove, kvSet } from '../storage/app-storage';
import { RATE_NATIVE_AD_SUPPRESS_UNTIL_KEY } from '../storage/keys';

export const RATE_NATIVE_AD_LOAD_TIMEOUT_MS = 5_000;
export const RATE_NATIVE_AD_PROGRESS_MS = 1_500;
const RATE_NATIVE_AD_FAILURE_COOLDOWN_MS = 30 * 60_000;

export type RateNativeAdSuppressionReason =
  | 'load-failed'
  | 'load-timeout'
  | 'module-unavailable'
  | 'missing-unit'
  | 'pro-user'
  | 'persisted-cooldown';

export interface RateNativeAdSuppressionSnapshot {
  suppressed: boolean;
  reason: RateNativeAdSuppressionReason | null;
  suppressUntil: number | null;
}

let sessionSuppressionReason: RateNativeAdSuppressionReason | null = null;
let sessionSuppressUntil: number | null = null;

function readPersistedSuppressUntil(now: number): number | null {
  const raw = kvGet(RATE_NATIVE_AD_SUPPRESS_UNTIL_KEY);
  if (!raw) return null;

  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= now) {
    kvRemove(RATE_NATIVE_AD_SUPPRESS_UNTIL_KEY);
    return null;
  }

  return parsed;
}

export function getRateNativeAdSuppressionSnapshot(
  now: number = Date.now()
): RateNativeAdSuppressionSnapshot {
  if (sessionSuppressionReason && (!sessionSuppressUntil || sessionSuppressUntil > now)) {
    return {
      suppressed: true,
      reason: sessionSuppressionReason,
      suppressUntil: sessionSuppressUntil,
    };
  }

  sessionSuppressionReason = null;
  sessionSuppressUntil = null;

  const persistedUntil = readPersistedSuppressUntil(now);
  if (persistedUntil) {
    return {
      suppressed: true,
      reason: 'persisted-cooldown',
      suppressUntil: persistedUntil,
    };
  }

  return { suppressed: false, reason: null, suppressUntil: null };
}

export function isRateNativeAdSuppressedSync(now: number = Date.now()): boolean {
  return getRateNativeAdSuppressionSnapshot(now).suppressed;
}

export function suppressRateNativeAdsTemporarily(
  reason: Exclude<RateNativeAdSuppressionReason, 'persisted-cooldown'>,
  now: number = Date.now(),
  ttlMs: number = RATE_NATIVE_AD_FAILURE_COOLDOWN_MS
): void {
  const until = now + ttlMs;
  sessionSuppressionReason = reason;
  sessionSuppressUntil = until;
  kvSet(RATE_NATIVE_AD_SUPPRESS_UNTIL_KEY, String(until));
}

export function clearRateNativeAdSuppressionForTests(): void {
  sessionSuppressionReason = null;
  sessionSuppressUntil = null;
  kvRemove(RATE_NATIVE_AD_SUPPRESS_UNTIL_KEY);
}
