import { describe, expect, it, mock } from 'bun:test';
import { restartGenreDeck } from '../../../libs/services/rate/restart-genre-deck';
import type { DeckItem, Photo } from '../../../components/rate/types';

const photo = (id: string): Photo => ({
  id,
  title: id,
  url: `https://img.example/${id}.jpg`,
  userId: 'test-user',
  score: 0,
  year: 2024,
});

describe('restartGenreDeck', () => {
  it('clears the selected genre deck and releases only ids from that deck', async () => {
    const a = photo('anime-a');
    const b = photo('anime-b');
    const deck: DeckItem[] = [
      { kind: 'photo', photo: a },
      { kind: 'ad', id: 'ad-0' },
      { kind: 'photo', photo: b },
      { kind: 'photo', photo: a },
    ];
    const clearDeck = mock(async (_genreId: string) => undefined);
    const clearSwipeSeenIds = mock(async (_ids: string[]) => undefined);

    const releasedIds = await restartGenreDeck('action', [a], deck, {
      clearDeck,
      clearSwipeSeenIds,
    });

    expect(clearDeck).toHaveBeenCalledWith('action');
    expect(clearSwipeSeenIds).toHaveBeenCalledWith(['anime-a', 'anime-b']);
    expect(releasedIds).toEqual(['anime-a', 'anime-b']);
  });
});
