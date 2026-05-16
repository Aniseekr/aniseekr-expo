import { describe, expect, it } from 'bun:test';
import { sameArrayBy } from '../../libs/utils/state-array';

describe('sameArrayBy', () => {
  it('returns true when arrays have the same item signatures in order', () => {
    const current = [
      { id: 'a', count: 1, ignored: 'old' },
      { id: 'b', count: 2, ignored: 'old' },
    ];
    const next = [
      { id: 'a', count: 1, ignored: 'new' },
      { id: 'b', count: 2, ignored: 'new' },
    ];

    expect(sameArrayBy(current, next, (item) => [item.id, item.count])).toBe(true);
  });

  it('returns false when length, order, or signature values differ', () => {
    const current = [
      { id: 'a', count: 1 },
      { id: 'b', count: 2 },
    ];

    expect(sameArrayBy(current, current.slice(0, 1), (item) => [item.id])).toBe(false);
    expect(
      sameArrayBy(
        current,
        [
          { id: 'b', count: 2 },
          { id: 'a', count: 1 },
        ],
        (item) => [item.id, item.count]
      )
    ).toBe(false);
    expect(
      sameArrayBy(
        current,
        [
          { id: 'a', count: 1 },
          { id: 'b', count: 3 },
        ],
        (item) => [item.id, item.count]
      )
    ).toBe(false);
  });
});
