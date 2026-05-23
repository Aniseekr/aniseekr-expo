import type { Anime } from '../../../components/rate/types';
import { dataSourceConfig } from '../data-source-config';
import { AnimeRepository } from '../../repositories/anime-repository';

const inFlightGenrePages = new Map<string, Promise<Anime[]>>();

function keyForGenrePage(genre: string, page: number): string {
  const r18Mode = dataSourceConfig.allowR18Content ? 'r18' : 'sfw';
  return `${r18Mode}:${genre}:${page}`;
}

export function loadGenreSwipePage(genre: string, page = 1): Promise<Anime[]> {
  const key = keyForGenrePage(genre, page);
  const existing = inFlightGenrePages.get(key);
  if (existing) return existing;

  const request = AnimeRepository.getAnimeByGenre(genre, page).finally(() => {
    inFlightGenrePages.delete(key);
  });
  inFlightGenrePages.set(key, request);
  return request;
}
