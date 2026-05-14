import type { DeckItem, Photo } from '../../../components/rate/types';
import { LocalDB } from '../../db';
import { clearDeck } from './deck-cache';

interface RestartGenreDeckDeps {
  clearDeck: (genreId: string) => Promise<void>;
  clearSwipeSeenIds: (ids: string[]) => Promise<void>;
}

const defaultDeps: RestartGenreDeckDeps = {
  clearDeck,
  clearSwipeSeenIds: (ids) => LocalDB.clearSwipeSeenIds(ids),
};

function collectRestartSwipeIds(photos: Photo[], deck: DeckItem[]): string[] {
  const ids = new Set<string>();
  for (const photo of photos) {
    if (photo.id) ids.add(photo.id);
  }
  for (const item of deck) {
    if (item.kind === 'photo' && item.photo.id) ids.add(item.photo.id);
  }
  return [...ids];
}

export async function restartGenreDeck(
  genreId: string,
  photos: Photo[],
  deck: DeckItem[],
  deps: RestartGenreDeckDeps = defaultDeps
): Promise<string[]> {
  const ids = collectRestartSwipeIds(photos, deck);
  await deps.clearDeck(genreId);
  if (ids.length > 0) {
    await deps.clearSwipeSeenIds(ids);
  }
  return ids;
}
