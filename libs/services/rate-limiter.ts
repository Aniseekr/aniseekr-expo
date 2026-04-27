/**
 * Per-channel rate limiter.
 *
 * Each channel has a `minIntervalMs` (the minimum gap between any two
 * `waitForAvailability` calls) and may carry an optional cooldown set via
 * `registerCooldown` (typically from a `Retry-After` response header).
 *
 * Cooldowns are max-wins: calling `registerCooldown(channel, 5_000)` after
 * `registerCooldown(channel, 30_000)` keeps the longer 30 s value.
 */

export type RateLimiterChannel =
  | 'anilist'
  | 'jikan'
  | 'bangumi'
  | 'annict'
  | 'kitsu'
  | 'shikimori'
  | 'simkl'
  | 'anitabi';

export interface RateLimiterChannelConfig {
  minIntervalMs: number;
}

const DEFAULT_CHANNELS: Record<RateLimiterChannel, RateLimiterChannelConfig> = {
  anilist: { minIntervalMs: 666 },
  jikan: { minIntervalMs: 350 },
  bangumi: { minIntervalMs: 333 },
  annict: { minIntervalMs: 500 },
  kitsu: { minIntervalMs: 333 },
  shikimori: { minIntervalMs: 200 },
  simkl: { minIntervalMs: 500 },
  anitabi: { minIntervalMs: 200 },
};

interface ChannelState {
  /** Earliest wall-clock time at which the next request may proceed. */
  nextAvailableAt: number;
}

export class RateLimiter {
  private static instance: RateLimiter | null = null;
  private readonly configs: Record<RateLimiterChannel, RateLimiterChannelConfig>;
  private readonly state: Map<RateLimiterChannel, ChannelState> = new Map();
  /** Optional override for `Date.now()` so tests can drive virtual time. */
  private nowFn: () => number = Date.now;
  /** Optional override for `setTimeout` so tests can drive virtual time. */
  private sleep: (ms: number) => Promise<void> = (ms) =>
    new Promise((resolve) => setTimeout(resolve, ms));

  static getInstance(): RateLimiter {
    if (!RateLimiter.instance) {
      RateLimiter.instance = new RateLimiter({ ...DEFAULT_CHANNELS });
    }
    return RateLimiter.instance;
  }

  /**
   * Mostly used in tests. Returns the singleton to a fresh state with the
   * default channel configuration.
   */
  static __resetForTests(): void {
    RateLimiter.instance = null;
  }

  constructor(configs: Record<RateLimiterChannel, RateLimiterChannelConfig>) {
    this.configs = configs;
  }

  /**
   * Override the time and sleep functions. Used by tests to avoid real wall
   * time. Must be called BEFORE any `waitForAvailability` invocation that
   * needs the override to take effect.
   */
  __setTimeFunctions(nowFn: () => number, sleep: (ms: number) => Promise<void>): void {
    this.nowFn = nowFn;
    this.sleep = sleep;
  }

  /**
   * Block until the channel is available, then record the request as the
   * "last touched" time so subsequent callers wait their turn.
   *
   * Returns the number of milliseconds the caller waited (useful for tests
   * and telemetry; production callers can ignore).
   */
  async waitForAvailability(channel: RateLimiterChannel): Promise<number> {
    const config = this.configs[channel];
    if (!config) {
      throw new Error(`Unknown rate-limiter channel: ${channel}`);
    }
    const now = this.nowFn();
    const state = this.state.get(channel);
    const target = state?.nextAvailableAt ?? 0;

    let waited = 0;
    if (target > now) {
      waited = target - now;
      await this.sleep(waited);
    }

    // Record this request — next call must wait `minIntervalMs` from now.
    const completedAt = this.nowFn();
    this.state.set(channel, {
      nextAvailableAt: completedAt + config.minIntervalMs,
    });
    return waited;
  }

  /**
   * Register an additional cooldown beyond the natural min-interval.
   * Typically called from a 429 handler with the `Retry-After` value.
   *
   * Cooldowns are max-wins: a longer existing cooldown is preserved.
   * A cooldown of <= 0 ms is a no-op.
   */
  registerCooldown(channel: RateLimiterChannel, ms: number): void {
    if (ms <= 0) return;
    if (!(channel in this.configs)) {
      throw new Error(`Unknown rate-limiter channel: ${channel}`);
    }
    const now = this.nowFn();
    const candidate = now + ms;
    const state = this.state.get(channel);
    const existing = state?.nextAvailableAt ?? 0;
    if (candidate > existing) {
      this.state.set(channel, { nextAvailableAt: candidate });
    }
  }

  /**
   * Inspection helper used by tests and the UI countdown.
   * Returns the next available wall-clock timestamp for the channel
   * (or 0 if nothing has been recorded).
   */
  getNextAvailableAt(channel: RateLimiterChannel): number {
    return this.state.get(channel)?.nextAvailableAt ?? 0;
  }

  /** Clear all state. */
  reset(): void {
    this.state.clear();
  }
}

export const rateLimiter = RateLimiter.getInstance();
