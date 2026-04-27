import type { PlatformType } from './auth/types';
import { QueryClient } from './query-client';
import { Logger } from '../utils/logger';

export type SwitchErrorCode =
  | 'NETWORK_ERROR'
  | 'AUTHENTICATION_REQUIRED'
  | 'PLATFORM_UNAVAILABLE'
  | 'CANCELLED'
  | 'UNKNOWN';

export interface SwitchError {
  code: SwitchErrorCode;
  message: string;
  platform?: PlatformType;
}

/**
 * Discriminated union mirroring Swift `SwitchingState` enum cases.
 *   { kind: 'idle' }
 *   { kind: 'switching', from, to }
 *   { kind: 'completed', source }
 *   { kind: 'failed', error }
 */
export type SwitchingState =
  | { kind: 'idle' }
  | { kind: 'switching'; from: PlatformType; to: PlatformType }
  | { kind: 'completed'; source: PlatformType }
  | { kind: 'failed'; error: SwitchError };

/** Subscriber callback fired on every state transition. */
export type SwitchingSubscriber = (state: SwitchingState) => void;

/**
 * Tunables exposed for tests so the 100 ms / 300 ms transition delays don't
 * slow the suite down. Production keeps the human-perceptible defaults.
 */
export interface SwitchingTimings {
  switchingDelayMs: number;
  completedHoldMs: number;
}

const DEFAULT_TIMINGS: SwitchingTimings = {
  switchingDelayMs: 100,
  completedHoldMs: 300,
};

export class DataSourceSwitchingCoordinator {
  private static instance: DataSourceSwitchingCoordinator | null = null;
  private state: SwitchingState = { kind: 'idle' };
  private readonly subscribers = new Set<SwitchingSubscriber>();
  private timings: SwitchingTimings = { ...DEFAULT_TIMINGS };
  private currentSwitchToken = 0;

  static getInstance(): DataSourceSwitchingCoordinator {
    if (!DataSourceSwitchingCoordinator.instance) {
      DataSourceSwitchingCoordinator.instance = new DataSourceSwitchingCoordinator();
    }
    return DataSourceSwitchingCoordinator.instance;
  }

  static __resetForTests(): void {
    DataSourceSwitchingCoordinator.instance = null;
  }

  /** Override transition delays. Tests typically set both to 0. */
  __setTimings(timings: Partial<SwitchingTimings>): void {
    this.timings = { ...this.timings, ...timings };
  }

  getState(): SwitchingState {
    return this.state;
  }

  subscribe(fn: SwitchingSubscriber): () => void {
    this.subscribers.add(fn);
    return () => {
      this.subscribers.delete(fn);
    };
  }

  /**
   * Drive the state machine through `switching → completed → idle`. Caches
   * for the source we're switching FROM are dropped at the end of the
   * `switching` window so the new source's results aren't stale.
   *
   * Returns a Promise that resolves when the machine returns to `idle`.
   */
  async beginSwitch(from: PlatformType, to: PlatformType): Promise<void> {
    const myToken = ++this.currentSwitchToken;

    this.transitionTo({ kind: 'switching', from, to });

    await delay(this.timings.switchingDelayMs);
    if (this.currentSwitchToken !== myToken) return; // superseded

    try {
      QueryClient.getInstance().invalidateForPlatform(from);
    } catch (err) {
      Logger.warn('[DataSourceSwitchingCoordinator] cache invalidation failed', err);
    }

    this.transitionTo({ kind: 'completed', source: to });
    await delay(this.timings.completedHoldMs);
    if (this.currentSwitchToken !== myToken) return;

    if (this.state.kind === 'completed') {
      this.transitionTo({ kind: 'idle' });
    }
  }

  /**
   * Mark the current switch as failed. Future calls to `clearError` reset to
   * `idle`. Cancels any in-flight `beginSwitch` (its post-delay assertions
   * will see a different token and bail).
   */
  fail(error: SwitchError): void {
    this.currentSwitchToken++;
    this.transitionTo({ kind: 'failed', error });
  }

  /** Reset the coordinator to `idle` from a `failed` state. */
  clearError(): void {
    if (this.state.kind === 'failed') {
      this.transitionTo({ kind: 'idle' });
    }
  }

  private transitionTo(next: SwitchingState): void {
    this.state = next;
    for (const subscriber of this.subscribers) {
      try {
        subscriber(next);
      } catch (err) {
        Logger.warn('[DataSourceSwitchingCoordinator] subscriber threw', err);
      }
    }
  }
}

function delay(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export const dataSourceSwitchingCoordinator = DataSourceSwitchingCoordinator.getInstance();
