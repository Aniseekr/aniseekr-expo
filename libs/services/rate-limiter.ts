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
  /**
   * Per-channel tail of an ordered promise chain. Each `waitForAvailability`
   * call hooks itself onto the previous tail so a `Promise.all([...20 calls])`
   * burst truly serialises: caller N can't read `nextAvailableAt` until N-1
   * has finished its slot and updated state. Without this, all 20 callers
   * read the same starting state in the same microtask, all skip the sleep,
   * and fire concurrently at the upstream — which is exactly what caused the
   * Discovery genre-image burst to 429 against AniList and cache empty images.
   */
  private readonly queues: Map<RateLimiterChannel, Promise<void>> = new Map();
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
   *
   * Concurrent calls (e.g. `Promise.all`) are serialised by hooking each
   * new caller onto a per-channel promise chain. Caller N+1's slot only
   * starts once caller N has updated `nextAvailableAt`, so the second
   * caller sees the first caller's footprint and waits.
   */
  async waitForAvailability(channel: RateLimiterChannel): Promise<number> {
    const config = this.configs[channel];
    if (!config) {
      throw new Error(`Unknown rate-limiter channel: ${channel}`);
    }
    const previous = this.queues.get(channel) ?? Promise.resolve();
    const current = previous.then(() => this.takeSlot(channel, config));
    // Swallow any rejection so the chain doesn't latch onto an error and
    // poison every subsequent caller. The caller of `current` still receives
    // the rejection.
    this.queues.set(
      channel,
      current.then(
        () => undefined,
        () => undefined,
      ),
    );
    return current;
  }

  private async takeSlot(
    channel: RateLimiterChannel,
    config: RateLimiterChannelConfig,
  ): Promise<number> {
    const startedAt = this.nowFn();
    const state = this.state.get(channel);
    const target = state?.nextAvailableAt ?? 0;

    let waited = 0;
    if (target > startedAt) {
      waited = target - startedAt;
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
    this.queues.clear();
  }
}

export const rateLimiter = RateLimiter.getInstance();
