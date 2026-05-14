import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import { useSharedValue } from 'react-native-reanimated';
import { SwipeDeckCard, type SwipeDeckCardRef } from './SwipeDeckCard';
import type { DeckItem } from './types';
import { OUTGOING_CARD_LIFETIME_MS } from '../../libs/services/rate/swipe-animation';
import {
  computeDeckWindow,
  expireOutgoing,
  shouldLoadMore,
  type OutgoingCard,
} from '../../libs/services/rate/swipe-deck-window';

export interface SwipeDeckRef {
  /** Programmatically commit the top card in a given direction (e.g. from action buttons). */
  swipe: (direction: 'left' | 'right') => void;
  /** Current top index — useful for parents that snapshot deck state on unmount. */
  getTopIndex: () => number;
}

interface Props {
  items: DeckItem[];
  /** Initial top index. Subsequent changes are ignored — re-mount with a new key to reset. */
  startIndex?: number;
  /** Wrapper padding applied to each card slot (header / bottom safe zone). */
  cardContainerStyle?: ViewStyle;
  /** Remaining items below which onNeedMore fires. */
  loadMoreThreshold?: number;
  /** Notified once per commit so the parent can persist (rating, seen, cache). */
  onCommit: (item: DeckItem, direction: 'left' | 'right') => void;
  /** Notified whenever the visible top changes (for overlay sync / cache index). */
  onTopChange?: (item: DeckItem | null, index: number) => void;
  /** Asked for more data when remaining drops below threshold. */
  onNeedMore?: () => void;
}

const DEFAULT_THRESHOLD = 5;

export const SwipeDeck = forwardRef<SwipeDeckRef, Props>(
  (
    {
      items,
      startIndex = 0,
      cardContainerStyle,
      loadMoreThreshold = DEFAULT_THRESHOLD,
      onCommit,
      onTopChange,
      onNeedMore,
    },
    ref
  ) => {
    const [topIndex, setTopIndex] = useState(startIndex);
    const [outgoing, setOutgoing] = useState<OutgoingCard[]>([]);
    const topTranslationX = useSharedValue(0);
    const topCardRef = useRef<SwipeDeckCardRef>(null);

    const itemsRef = useRef(items);
    itemsRef.current = items;
    const topIndexRef = useRef(topIndex);
    topIndexRef.current = topIndex;
    const onCommitRef = useRef(onCommit);
    onCommitRef.current = onCommit;
    const expiryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const handleSwipe = useCallback((direction: 'left' | 'right') => {
      const snapshot = itemsRef.current;
      const idx = topIndexRef.current;
      const committed = snapshot[idx];
      if (!committed) return;

      const now = Date.now();
      setOutgoing((prev) => [
        ...expireOutgoing({ outgoing: prev, now, lifetimeMs: OUTGOING_CARD_LIFETIME_MS }),
        { item: committed, direction, committedAt: now },
      ]);
      setTopIndex((prev) => prev + 1);
      // Snap the shared driver back so background slots base on the new top's
      // identity transform. The outgoing card's own translateX continues the
      // fly-out under its local PhotoCard / NativeAdCard.
      topTranslationX.value = 0;

      onCommitRef.current(committed, direction);

      if (expiryTimerRef.current) clearTimeout(expiryTimerRef.current);
      expiryTimerRef.current = setTimeout(() => {
        expiryTimerRef.current = null;
        setOutgoing((prev) =>
          expireOutgoing({
            outgoing: prev,
            now: Date.now(),
            lifetimeMs: OUTGOING_CARD_LIFETIME_MS,
          })
        );
      }, OUTGOING_CARD_LIFETIME_MS);
    }, [topTranslationX]);

    useImperativeHandle(
      ref,
      () => ({
        swipe: (direction) => {
          topCardRef.current?.swipe(direction);
        },
        getTopIndex: () => topIndexRef.current,
      }),
      []
    );

    useEffect(() => {
      return () => {
        if (expiryTimerRef.current) clearTimeout(expiryTimerRef.current);
      };
    }, []);

    // Surface the new top to the parent once per topIndex / items change.
    const lastTopKeyRef = useRef<string | null>(null);
    useEffect(() => {
      const item = items[topIndex] ?? null;
      const key = item ? `${topIndex}:${item.kind === 'photo' ? item.photo.id : item.id}` : `${topIndex}:null`;
      if (lastTopKeyRef.current === key) return;
      lastTopKeyRef.current = key;
      onTopChange?.(item, topIndex);
    }, [items, topIndex, onTopChange]);

    useEffect(() => {
      if (!onNeedMore) return;
      if (shouldLoadMore({ topIndex, itemsLength: items.length, threshold: loadMoreThreshold })) {
        onNeedMore();
      }
    }, [items.length, topIndex, loadMoreThreshold, onNeedMore]);

    const windowEntries = useMemo(
      () => computeDeckWindow({ items, topIndex, outgoing }),
      [items, topIndex, outgoing]
    );

    return (
      <View style={styles.stack} pointerEvents="box-none">
        {windowEntries.map((entry) => {
          const isTop = entry.slot === 'top';
          // Locate the entry's index in items[] so PhotoCard can pass it on.
          // For outgoing entries the data has already advanced past them; we
          // just hand 0 which is only used for diagnostics.
          const idx = entry.slot === 'outgoing' ? -1 : topIndex + (entry.slot === 'top' ? 0 : entry.slot === 'next' ? 1 : 2);
          return (
            <SwipeDeckCard
              key={entry.key}
              ref={isTop ? topCardRef : null}
              item={entry.item}
              slot={entry.slot}
              topTranslationX={topTranslationX}
              index={idx}
              containerStyle={cardContainerStyle}
              onSwipe={handleSwipe}
            />
          );
        })}
      </View>
    );
  }
);

SwipeDeck.displayName = 'SwipeDeck';

const styles = StyleSheet.create({
  stack: {
    flex: 1,
    width: '100%',
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
