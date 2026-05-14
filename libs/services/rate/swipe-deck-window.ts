import type { DeckItem } from '../../../components/rate/types';

// Slot positions in the visible stack. `outgoing` is the slot used by cards
// that were once `top` but are still mid-fly-out — keeping them in the deck
// window means the swipe animation never gets cut short by a React unmount.
export type DeckSlot = 'outgoing' | 'top' | 'next' | 'third';

// Visible cards behind the active card. Top + next + third = 3.
export const VISIBLE_SLOT_COUNT = 3;

export interface OutgoingCard {
  item: DeckItem;
  direction: 'left' | 'right';
  /** Wall-clock ms (`Date.now()`) when the card was committed. Used to expire. */
  committedAt: number;
}

export interface DeckWindowEntry {
  /** Stable mount key, e.g. `photo:abc` / `ad:0`. */
  key: string;
  slot: DeckSlot;
  item: DeckItem;
}

export interface ComputeDeckWindowArgs {
  items: DeckItem[];
  topIndex: number;
  outgoing: readonly OutgoingCard[];
}

export function deckItemKey(item: DeckItem): string {
  return item.kind === 'photo' ? `photo:${item.photo.id}` : `ad:${item.id}`;
}

/**
 * Build the ordered list of cards SwipeDeck needs to render.
 *
 * Outgoing cards come first so React tree order matches "lower in z" → "higher
 * in z" intent; the actual stacking is decided by the slot's zIndex inside
 * SwipeDeckCard, so order here is mainly cosmetic.
 *
 * Invariants the consumer (and tests) rely on:
 * - Visible (non-outgoing) slot count is at most VISIBLE_SLOT_COUNT.
 * - Outgoing entries never collide with top/next/third even if the user
 *   commits faster than the outgoing lifetime — committedAt makes the entries
 *   distinct and the underlying DeckItem keys are stable.
 * - The returned key matches `deckItemKey(item)` exactly so SwipeDeck can
 *   stable-key its rendered children.
 */
export function computeDeckWindow({
  items,
  topIndex,
  outgoing,
}: ComputeDeckWindowArgs): DeckWindowEntry[] {
  const window: DeckWindowEntry[] = [];

  for (const card of outgoing) {
    window.push({ key: deckItemKey(card.item), slot: 'outgoing', item: card.item });
  }

  const slotOrder: DeckSlot[] = ['top', 'next', 'third'];
  for (let i = 0; i < VISIBLE_SLOT_COUNT; i += 1) {
    const item = items[topIndex + i];
    if (!item) break;
    window.push({ key: deckItemKey(item), slot: slotOrder[i], item });
  }

  return window;
}

export interface LoadMoreCheck {
  topIndex: number;
  itemsLength: number;
  threshold: number;
}

export function remainingFromTop({
  topIndex,
  itemsLength,
}: Pick<LoadMoreCheck, 'topIndex' | 'itemsLength'>): number {
  return Math.max(0, itemsLength - topIndex);
}

export function shouldLoadMore({ topIndex, itemsLength, threshold }: LoadMoreCheck): boolean {
  return remainingFromTop({ topIndex, itemsLength }) <= threshold;
}

export interface ExpireOutgoingArgs {
  outgoing: readonly OutgoingCard[];
  now: number;
  lifetimeMs: number;
}

/**
 * Drop outgoing entries that have aged past `lifetimeMs`. Pure so the timer
 * driver in SwipeDeck can call this in a single `setOutgoing` update without
 * forking the expiry logic.
 */
export function expireOutgoing({
  outgoing,
  now,
  lifetimeMs,
}: ExpireOutgoingArgs): OutgoingCard[] {
  return outgoing.filter((card) => now - card.committedAt < lifetimeMs);
}
