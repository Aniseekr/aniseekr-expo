// Navigate to the anime detail screen with route-param chrome (title +
// poster) so frame 1 paints the hero immediately, and kick off background
// prefetches so the data + image cache is warm by the time the screen mounts.
//
// See CLAUDE.md Rule 10 (Navigation feel → never `await` on the first-paint
// path). Every list → detail call site in the app should go through here
// instead of `router.push(`/anime/${id}`)`.

import type { Router } from 'expo-router';
import { Image } from 'expo-image';
import { AnimeRepository } from '../repositories/anime-repository';

export interface AnimeNavSeed {
  id: string | number;
  title?: string;
  /** Poster URL (image / image_url / coverImage). */
  image?: string;
  bannerImage?: string;
}

/**
 * Push `/anime/[id]` carrying the chrome the destination needs to paint frame 1.
 * Also warms the detail cache + poster image in the background — both no-op
 * when already warm, so it is safe to call from press-in handlers.
 */
export function pushAnimeDetail(
  router: Pick<Router, 'push'>,
  seed: AnimeNavSeed,
  extra?: Record<string, string>
): void {
  const id = String(seed.id);
  prefetchAnimeDetail(seed);
  router.push({
    pathname: `/anime/${id}`,
    params: {
      ...(seed.title ? { title: seed.title } : {}),
      ...(seed.image ? { image: seed.image } : {}),
      ...(seed.bannerImage ? { bannerImage: seed.bannerImage } : {}),
      ...(extra ?? {}),
    },
  });
}

/**
 * Warm the detail cache + poster image. Safe to call from press-in /
 * `onViewableItemsChanged` — both calls are best-effort and dedup naturally
 * (the repository hits the in-memory mirror and `Image.prefetch` is idempotent).
 */
export function prefetchAnimeDetail(seed: AnimeNavSeed): void {
  const id = String(seed.id);
  if (!id) return;
  // If the sync cache already has it, this is a no-op fast-return inside the
  // repository — no network hit.
  if (!AnimeRepository.getAnimeDetailsSync(id)) {
    void AnimeRepository.getAnimeDetails(id).catch(() => undefined);
  }
  if (seed.image) void Image.prefetch(seed.image).catch(() => undefined);
  if (seed.bannerImage) void Image.prefetch(seed.bannerImage).catch(() => undefined);
}
