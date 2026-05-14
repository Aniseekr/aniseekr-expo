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
    expect(w.map((e) => e.key)).toEqual(['photo:a@0', 'photo:b@1', 'photo:c@2']);
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
      { item: photo('a'), key: 'photo:a@0', direction: 'right', committedAt: 1000 },
    ];
    const w = computeDeckWindow({ items: ITEMS, topIndex: 1, outgoing });
    expect(w.map((e) => ({ key: e.key, slot: e.slot }))).toEqual([
      { key: 'photo:a@0', slot: 'outgoing' },
      { key: 'photo:b@1', slot: 'top' },
      { key: 'photo:c@2', slot: 'next' },
      { key: 'photo:d@3', slot: 'third' },
    ]);
  });

  it('survives two rapid commits without losing either outgoing card', () => {
    const outgoing: OutgoingCard[] = [
      { item: photo('a'), key: 'photo:a@0', direction: 'right', committedAt: 1000 },
      { item: photo('b'), key: 'photo:b@1', direction: 'left', committedAt: 1060 },
    ];
    const w = computeDeckWindow({ items: ITEMS, topIndex: 2, outgoing });
    const slotByKey = Object.fromEntries(w.map((e) => [e.key, e.slot]));
    expect(slotByKey['photo:a@0']).toBe('outgoing');
    expect(slotByKey['photo:b@1']).toBe('outgoing');
    expect(slotByKey['photo:c@2']).toBe('top');
    expect(slotByKey['photo:d@3']).toBe('next');
    expect(slotByKey['photo:e@4']).toBe('third');
  });

  it('shows just the outgoing card when the deck is fully consumed mid-animation', () => {
    const outgoing: OutgoingCard[] = [
      { item: photo('e'), key: 'photo:e@4', direction: 'right', committedAt: 1000 },
    ];
    const w = computeDeckWindow({ items: ITEMS, topIndex: 5, outgoing });
    expect(w).toEqual([{ key: 'photo:e@4', slot: 'outgoing', item: photo('e') }]);
  });

  it('keys duplicate photo occurrences by their absolute deck index', () => {
    const duplicateItems = [photo('dup'), photo('dup'), photo('c')];
    const w = computeDeckWindow({ items: duplicateItems, topIndex: 0, outgoing: [] });
    expect(w.map((e) => e.key)).toEqual(['photo:dup@0', 'photo:dup@1', 'photo:c@2']);
    expect(new Set(w.map((e) => e.key)).size).toBe(w.length);
  });

  it('keeps an outgoing duplicate distinct from the duplicate revealed below it', () => {
    const duplicateItems = [photo('dup'), photo('dup'), photo('c')];
    const outgoing: OutgoingCard[] = [
      { item: photo('dup'), key: 'photo:dup@0', direction: 'right', committedAt: 1000 },
    ];
    const w = computeDeckWindow({ items: duplicateItems, topIndex: 1, outgoing });
    expect(w.map((e) => ({ key: e.key, slot: e.slot }))).toEqual([
      { key: 'photo:dup@0', slot: 'outgoing' },
      { key: 'photo:dup@1', slot: 'top' },
      { key: 'photo:c@2', slot: 'next' },
    ]);
  });

  it('dedupes repeated outgoing entries for the same committed occurrence', () => {
    const outgoing: OutgoingCard[] = [
      { item: photo('a'), key: 'photo:a@0', direction: 'right', committedAt: 1000 },
      { item: photo('a'), key: 'photo:a@0', direction: 'right', committedAt: 1001 },
    ];
    const w = computeDeckWindow({ items: ITEMS, topIndex: 1, outgoing });
    expect(w.filter((e) => e.key === 'photo:a@0')).toHaveLength(1);
    expect(new Set(w.map((e) => e.key)).size).toBe(w.length);
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
      { item: photo('a'), key: 'photo:a@0', direction: 'right', committedAt: 1000 },
      { item: photo('b'), key: 'photo:b@1', direction: 'left', committedAt: 1300 },
    ];
    const survivors = expireOutgoing({ outgoing, now: 1450, lifetimeMs: 400 });
    expect(survivors.map((c) => c.item)).toEqual([photo('b')]);
  });

  it('keeps every outgoing entry when none has aged past lifetime', () => {
    const outgoing: OutgoingCard[] = [
      { item: photo('a'), key: 'photo:a@0', direction: 'right', committedAt: 1000 },
      { item: photo('b'), key: 'photo:b@1', direction: 'left', committedAt: 1100 },
    ];
    const survivors = expireOutgoing({ outgoing, now: 1200, lifetimeMs: 400 });
    expect(survivors).toEqual(outgoing);
  });
});
