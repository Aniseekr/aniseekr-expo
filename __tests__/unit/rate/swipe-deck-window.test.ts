import { describe, expect, it } from 'bun:test';
import type { DeckItem } from '../../../components/rate/types';
import {
  computeDeckWindow,
  deckItemKey,
  expireOutgoing,
  remainingFromTop,
  shouldLoadMore,
  VISIBLE_SLOT_COUNT,
  type OutgoingCard,
} from '../../../libs/services/rate/swipe-deck-window';

function photo(id: string): DeckItem {
  return { kind: 'photo', photo: { id, url: `https://example/${id}.jpg`, userId: 'u' } };
}

function ad(id: string): DeckItem {
  return { kind: 'ad', id };
}

const ITEMS: DeckItem[] = [photo('a'), photo('b'), photo('c'), photo('d'), photo('e')];

describe('swipe-deck-window', () => {
  it('keeps the visible slot count stable when there are enough items', () => {
    const w = computeDeckWindow({ items: ITEMS, topIndex: 0, outgoing: [] });
    expect(w.map((e) => e.slot)).toEqual(['top', 'next', 'third']);
    expect(w.map((e) => e.key)).toEqual(['photo:a', 'photo:b', 'photo:c']);
    expect(w.length).toBe(VISIBLE_SLOT_COUNT);
  });

  it('shrinks the window near the end of the deck without padding it', () => {
    const w = computeDeckWindow({ items: ITEMS, topIndex: 4, outgoing: [] });
    expect(w.map((e) => e.slot)).toEqual(['top']);
  });

  it('returns an empty window once topIndex passes the deck and nothing is outgoing', () => {
    expect(computeDeckWindow({ items: ITEMS, topIndex: 5, outgoing: [] })).toEqual([]);
  });

  it('keeps the outgoing card mounted while the new top is revealed', () => {
    const outgoing: OutgoingCard[] = [
      { item: photo('a'), direction: 'right', committedAt: 1000 },
    ];
    const w = computeDeckWindow({ items: ITEMS, topIndex: 1, outgoing });
    expect(w.map((e) => ({ key: e.key, slot: e.slot }))).toEqual([
      { key: 'photo:a', slot: 'outgoing' },
      { key: 'photo:b', slot: 'top' },
      { key: 'photo:c', slot: 'next' },
      { key: 'photo:d', slot: 'third' },
    ]);
  });

  it('survives two rapid commits without losing either outgoing card', () => {
    const outgoing: OutgoingCard[] = [
      { item: photo('a'), direction: 'right', committedAt: 1000 },
      { item: photo('b'), direction: 'left', committedAt: 1060 },
    ];
    const w = computeDeckWindow({ items: ITEMS, topIndex: 2, outgoing });
    const slotByKey = Object.fromEntries(w.map((e) => [e.key, e.slot]));
    expect(slotByKey['photo:a']).toBe('outgoing');
    expect(slotByKey['photo:b']).toBe('outgoing');
    expect(slotByKey['photo:c']).toBe('top');
    expect(slotByKey['photo:d']).toBe('next');
    expect(slotByKey['photo:e']).toBe('third');
  });

  it('shows just the outgoing card when the deck is fully consumed mid-animation', () => {
    const outgoing: OutgoingCard[] = [
      { item: photo('e'), direction: 'right', committedAt: 1000 },
    ];
    const w = computeDeckWindow({ items: ITEMS, topIndex: 5, outgoing });
    expect(w).toEqual([{ key: 'photo:e', slot: 'outgoing', item: photo('e') }]);
  });

  it('keys ad sentinels separately from photo cards', () => {
    expect(deckItemKey(ad('promo'))).toBe('ad:promo');
    expect(deckItemKey(photo('zzz'))).toBe('photo:zzz');
  });

  it('reports the count of unswiped items from the visual top', () => {
    expect(remainingFromTop({ topIndex: 0, itemsLength: 10 })).toBe(10);
    expect(remainingFromTop({ topIndex: 7, itemsLength: 10 })).toBe(3);
    expect(remainingFromTop({ topIndex: 10, itemsLength: 10 })).toBe(0);
    expect(remainingFromTop({ topIndex: 12, itemsLength: 10 })).toBe(0);
  });

  it('flags loadMore once remaining drops to the threshold', () => {
    expect(shouldLoadMore({ topIndex: 4, itemsLength: 10, threshold: 5 })).toBe(false);
    expect(shouldLoadMore({ topIndex: 5, itemsLength: 10, threshold: 5 })).toBe(true);
    expect(shouldLoadMore({ topIndex: 10, itemsLength: 10, threshold: 5 })).toBe(true);
  });

  it('expires outgoing entries past their lifetime', () => {
    const outgoing: OutgoingCard[] = [
      { item: photo('a'), direction: 'right', committedAt: 1000 },
      { item: photo('b'), direction: 'left', committedAt: 1300 },
    ];
    const survivors = expireOutgoing({ outgoing, now: 1450, lifetimeMs: 400 });
    expect(survivors.map((c) => c.item)).toEqual([photo('b')]);
  });

  it('keeps every outgoing entry when none has aged past lifetime', () => {
    const outgoing: OutgoingCard[] = [
      { item: photo('a'), direction: 'right', committedAt: 1000 },
      { item: photo('b'), direction: 'left', committedAt: 1100 },
    ];
    const survivors = expireOutgoing({ outgoing, now: 1200, lifetimeMs: 400 });
    expect(survivors).toEqual(outgoing);
  });
});
