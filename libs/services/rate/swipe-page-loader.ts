import type { Photo } from '../../../components/rate/types';
import { hasPotentialNextSwipePage } from './swipe-pagination';

const DEFAULT_MAX_PAGES_TO_SCAN = 5;

export interface LoadNextUsableSwipePageOptions<T> {
  startPage: number;
  fetchPage: (page: number) => Promise<T[]>;
  mapItemToPhoto: (item: T) => Photo;
  existingIds?: ReadonlySet<string>;
  seenIds?: ReadonlySet<string>;
  includeSeen?: boolean;
  maxPagesToScan?: number;
  maxEmptyPagesToSkip?: number;
  targetPhotoCount?: number;
}

export interface LoadNextUsableSwipePageResult {
  photos: Photo[];
  currentPage: number;
  hasMore: boolean;
  scannedPages: number;
  stoppedByScanLimit: boolean;
  releasableSeenIds: string[];
}

export async function loadNextUsableSwipePage<T>({
  startPage,
  fetchPage,
  mapItemToPhoto,
  existingIds = new Set(),
  seenIds = new Set(),
  includeSeen = false,
  maxPagesToScan = DEFAULT_MAX_PAGES_TO_SCAN,
  maxEmptyPagesToSkip = 0,
  targetPhotoCount = 1,
}: LoadNextUsableSwipePageOptions<T>): Promise<LoadNextUsableSwipePageResult> {
  const scannedIds = new Set(existingIds);
  const releasableSeenIds = new Set<string>();
  const photos: Photo[] = [];
  const scanLimit = Math.max(1, maxPagesToScan);
  const emptyPageSkipLimit = Math.max(0, maxEmptyPagesToSkip);
  const targetCount = Math.max(1, targetPhotoCount);
  let page = Math.max(1, startPage);
  let currentPage = page;
  let hasMore = true;
  let scannedPages = 0;
  let emptyPagesSkipped = 0;

  while (scannedPages < scanLimit) {
    const items = await fetchPage(page);
    scannedPages += 1;
    currentPage = page;
    hasMore = hasPotentialNextSwipePage(items.length);

    const usablePhotos = items.flatMap((item) => {
      const photo = mapItemToPhoto(item);
      if (!photo.url) return [];
      if (scannedIds.has(photo.id)) return [];
      if (!includeSeen && seenIds.has(photo.id)) {
        releasableSeenIds.add(photo.id);
        return [];
      }
      scannedIds.add(photo.id);
      return [photo];
    });

    if (usablePhotos.length > 0) {
      photos.push(...usablePhotos);
      if (photos.length >= targetCount) {
        return {
          photos,
          currentPage,
          hasMore,
          scannedPages,
          stoppedByScanLimit: false,
          releasableSeenIds: [...releasableSeenIds],
        };
      }
    }

    if (!hasMore) {
      if (emptyPagesSkipped < emptyPageSkipLimit) {
        emptyPagesSkipped += 1;
        page += 1;
        continue;
      }
      return {
        photos,
        currentPage,
        hasMore: false,
        scannedPages,
        stoppedByScanLimit: false,
        releasableSeenIds: [...releasableSeenIds],
      };
    }

    page += 1;
  }

  return {
    photos,
    currentPage,
    hasMore: true,
    scannedPages,
    stoppedByScanLimit: true,
    releasableSeenIds: [...releasableSeenIds],
  };
}
