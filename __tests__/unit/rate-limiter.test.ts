import { describe, it, expect, beforeEach } from 'bun:test';
import { RateLimiter } from '../../libs/services/rate-limiter';

/**
 * Build a RateLimiter wired to virtual time. We expose the `tick(ms)` helper
 * to advance the clock and resolve any pending sleep without needing real
 * setTimeout to fire.
 */
function buildVirtualLimiter() {
  const limiter = RateLimiter.getInstance();
  let now = 0;
  // pending sleeper recorded so we can release it via tick().
  let pending: { until: number; resolve: () => void } | null = null;

  limiter.__setTimeFunctions(
    () => now,
    (ms: number) =>
      new Promise<void>((resolve) => {
        pending = { until: now + ms, resolve };
      })
  );

  function tick(deltaMs: number): void {
    now += deltaMs;
    if (pending && pending.until <= now) {
      const r = pending.resolve;
      pending = null;
      r();
    }
  }
  return { limiter, tick, getNow: () => now };
}

describe('RateLimiter', () => {
  beforeEach(() => {
    RateLimiter.__resetForTests();
  });

  it('RL-001 first request resolves immediately (under 10ms wall time)', async () => {
    const limiter = RateLimiter.getInstance();
    const start = Date.now();
    const waited = await limiter.waitForAvailability('anilist');
    const elapsed = Date.now() - start;
    expect(waited).toBe(0);
    expect(elapsed).toBeLessThan(50);
  });

  it('RL-002 second call within minIntervalMs waits until interval elapsed', async () => {
    const { limiter, tick } = buildVirtualLimiter();

    const w1 = await limiter.waitForAvailability('jikan');
    expect(w1).toBe(0);

    // Issue the second request — it should sleep ~350 ms (jikan minInterval).
    const p2 = limiter.waitForAvailability('jikan');
    // Drive virtual time forward enough to release the sleep.
    tick(350);
    const w2 = await p2;
    expect(w2).toBeGreaterThanOrEqual(349);
    expect(w2).toBeLessThanOrEqual(351);
  });

  it('RL-003 registerCooldown delays next request by cooldown ms', async () => {
    const { limiter, tick } = buildVirtualLimiter();
    limiter.registerCooldown('bangumi', 5_000);

    const p = limiter.waitForAvailability('bangumi');
    tick(5_000);
    const waited = await p;
    expect(waited).toBeGreaterThanOrEqual(4_999);
  });

  it('RL-004 longer cooldown wins over shorter one (max-wins)', async () => {
    const { limiter } = buildVirtualLimiter();
    const before = limiter.getNextAvailableAt('bangumi');
    limiter.registerCooldown('bangumi', 30_000);
    const after30 = limiter.getNextAvailableAt('bangumi');
    expect(after30).toBeGreaterThan(before);

    // Shorter cooldown should NOT shrink it.
    limiter.registerCooldown('bangumi', 5_000);
    const after5 = limiter.getNextAvailableAt('bangumi');
    expect(after5).toBe(after30);
  });

  it('RL-005 cooldown on one channel does not affect another channel', async () => {
    const { limiter } = buildVirtualLimiter();
    limiter.registerCooldown('anilist', 60_000);
    expect(limiter.getNextAvailableAt('anilist')).toBeGreaterThan(0);
    expect(limiter.getNextAvailableAt('jikan')).toBe(0);

    // First jikan call still resolves immediately despite anilist cooldown.
    const waited = await limiter.waitForAvailability('jikan');
    expect(waited).toBe(0);
  });
});
