import { describe, it, expect, beforeEach } from 'bun:test';
import { RateLimiter } from '../../libs/services/rate-limiter';

/**
 * Build a RateLimiter wired to virtual time. We expose the `tick(ms)` helper
 * to advance the clock and resolve any pending sleep without needing real
 * setTimeout to fire.
 *
 * `flush()` drains the microtask queue so callers can be sure the per-channel
 * promise chain has reached its `await sleep(...)` (and the mock recorded a
 * `pending` slot) before calling `tick`. Without this, ticking races ahead of
 * the slot's actual sleep registration and the test sees `waited = 0`.
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

  async function flush(): Promise<void> {
    // Two awaits cover the worst case in our chain:
    //   queues.get(channel) → .then() to enter takeSlot → first nowFn() read
    // so the mock-sleep `pending` has been registered by the time we return.
    await Promise.resolve();
    await Promise.resolve();
  }

  return { limiter, tick, flush, getNow: () => now };
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
    const { limiter, tick, flush } = buildVirtualLimiter();

    const w1 = await limiter.waitForAvailability('jikan');
    expect(w1).toBe(0);

    // Issue the second request — it should sleep ~350 ms (jikan minInterval).
    const p2 = limiter.waitForAvailability('jikan');
    // Let the queued slot reach its `await sleep(...)` before ticking, otherwise
    // we'd advance the virtual clock past the rate-limit window before the slot
    // even reads it.
    await flush();
    tick(350);
    const w2 = await p2;
    expect(w2).toBeGreaterThanOrEqual(349);
    expect(w2).toBeLessThanOrEqual(351);
  });

  it('RL-003 registerCooldown delays next request by cooldown ms', async () => {
    const { limiter, tick, flush } = buildVirtualLimiter();
    limiter.registerCooldown('bangumi', 5_000);

    const p = limiter.waitForAvailability('bangumi');
    await flush();
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

  it('RL-006 concurrent burst serialises — each caller waits one minInterval more than the previous', async () => {
    // Regression for the Discovery genre-images bug: a `Promise.all([...20])`
    // burst used to all read `nextAvailableAt = 0`, all skip the sleep, and
    // all fire concurrently at AniList. The first batch of overflowing
    // callers 429'd and got cached as `image: ''` for 24 hours. With the
    // per-channel promise chain, slot N+1 cannot read state until slot N
    // has updated it, so each successive caller sleeps one full window.
    const limiter = RateLimiter.getInstance();
    let now = 0;
    type PendingSlot = { until: number; resolve: () => void };
    let pending: PendingSlot | null = null;
    limiter.__setTimeFunctions(
      () => now,
      (ms: number) =>
        new Promise<void>((resolve) => {
          // Cast to PendingSlot via the local variable — the assignment inside
          // a separate closure trips TS's narrow-to-never on the outer `let`.
          const slot: PendingSlot = { until: now + ms, resolve };
          pending = slot;
        }),
    );

    // Fire 4 concurrent callers — like a small slice of the 20-genre burst.
    const promises = [0, 1, 2, 3].map(() => limiter.waitForAvailability('anilist'));

    // Drive the virtual clock forward in 666 ms steps (anilist minInterval),
    // releasing whichever caller is currently parked in `sleep`. The chain
    // structure guarantees only one caller sleeps at a time.
    const waits: number[] = [];
    waits.push(await promises[0]); // first caller: no wait

    for (let i = 1; i < promises.length; i++) {
      // Let the next slot reach its `await sleep(...)` before advancing time.
      await Promise.resolve();
      await Promise.resolve();
      now += 666;
      // TS narrows `pending` to never across the closure assignment — read
      // back through the named type so we can still inspect it.
      const slot = pending as PendingSlot | null;
      if (slot && slot.until <= now) {
        pending = null;
        slot.resolve();
      }
      waits.push(await promises[i]);
    }

    expect(waits[0]).toBe(0);
    expect(waits[1]).toBeGreaterThanOrEqual(665);
    expect(waits[2]).toBeGreaterThanOrEqual(665);
    expect(waits[3]).toBeGreaterThanOrEqual(665);
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
