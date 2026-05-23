import { describe, expect, it } from 'bun:test';
import type { Photo } from '../../../components/rate/types';
import { loadNextUsableSwipePage } from '../../../libs/services/rate/swipe-page-loader';

type Item = {
  id: string;
  image?: string;
};

function mapItemToPhoto(item: Item): Photo {
  return {
    id: item.id,
    title: item.id,
    url: item.image ?? '',
    userId: 'test-user',
  };
}

describe('loadNextUsableSwipePage', () => {
  it('skips source pages that produce no usable swipe cards', async () => {
    const calls: number[] = [];
    const pages: Record<number, Item[]> = {
      1: [{ id: 'seen-a', image: 'https://img.example/seen-a.jpg' }],
      2: [{ id: 'fresh-b', image: 'https://img.example/fresh-b.jpg' }],
    };

    const result = await loadNextUsableSwipePage({
      startPage: 1,
      fetchPage: async (page) => {
        calls.push(page);
        return pages[page] ?? [];
      },
      mapItemToPhoto,
      seenIds: new Set(['seen-a']),
    });

    expect(calls).toEqual([1, 2]);
    expect(result.photos.map((photo) => photo.id)).toEqual(['fresh-b']);
    expect(result.currentPage).toBe(2);
    expect(result.hasMore).toBe(true);
    expect(result.stoppedByScanLimit).toBe(false);
    expect(result.releasableSeenIds).toEqual(['seen-a']);
  });

  it('marks the deck exhausted after too many pages produce no usable cards', async () => {
    const result = await loadNextUsableSwipePage({
      startPage: 4,
      maxPagesToScan: 3,
      fetchPage: async (page) => [
        { id: `seen-${page}`, image: `https://img.example/seen-${page}.jpg` },
      ],
      mapItemToPhoto,
      seenIds: new Set(['seen-4', 'seen-5', 'seen-6']),
    });

    expect(result.photos).toEqual([]);
    expect(result.currentPage).toBe(6);
    expect(result.hasMore).toBe(true);
    expect(result.stoppedByScanLimit).toBe(true);
    expect(result.releasableSeenIds).toEqual(['seen-4', 'seen-5', 'seen-6']);
  });

  it('keeps scanning until the requested usable photo target is reached', async () => {
    const calls: number[] = [];
    const pages: Record<number, Item[]> = {
      1: [{ id: 'fresh-a', image: 'https://img.example/fresh-a.jpg' }],
      2: [{ id: 'seen-b', image: 'https://img.example/seen-b.jpg' }],
      3: [{ id: 'fresh-c', image: 'https://img.example/fresh-c.jpg' }],
      4: [{ id: 'fresh-d', image: 'https://img.example/fresh-d.jpg' }],
    };

    const result = await loadNextUsableSwipePage({
      startPage: 1,
      targetPhotoCount: 3,
      fetchPage: async (page) => {
        calls.push(page);
        return pages[page] ?? [];
      },
      mapItemToPhoto,
      seenIds: new Set(['seen-b']),
    });

    expect(calls).toEqual([1, 2, 3, 4]);
    expect(result.photos.map((photo) => photo.id)).toEqual(['fresh-a', 'fresh-c', 'fresh-d']);
    expect(result.currentPage).toBe(4);
    expect(result.hasMore).toBe(true);
    expect(result.stoppedByScanLimit).toBe(false);
    expect(result.releasableSeenIds).toEqual(['seen-b']);
  });

  it('can skip filtered-empty pages before treating the source as exhausted', async () => {
    const calls: number[] = [];
    const pages: Record<number, Item[]> = {
      2: [{ id: 'fresh-b', image: 'https://img.example/fresh-b.jpg' }],
    };

    const result = await loadNextUsableSwipePage({
      startPage: 1,
      maxEmptyPagesToSkip: 2,
      fetchPage: async (page) => {
        calls.push(page);
        return pages[page] ?? [];
      },
      mapItemToPhoto,
    });

    expect(calls).toEqual([1, 2]);
    expect(result.photos.map((photo) => photo.id)).toEqual(['fresh-b']);
    expect(result.currentPage).toBe(2);
    expect(result.hasMore).toBe(true);
    expect(result.stoppedByScanLimit).toBe(false);
  });

  it('stops normally when the source returns an empty page', async () => {
    const calls: number[] = [];
    const result = await loadNextUsableSwipePage({
      startPage: 1,
      fetchPage: async (page) => {
        calls.push(page);
        return page === 1 ? [{ id: 'seen-a', image: 'https://img.example/seen-a.jpg' }] : [];
      },
      mapItemToPhoto,
      seenIds: new Set(['seen-a']),
    });

    expect(calls).toEqual([1, 2]);
    expect(result.photos).toEqual([]);
    expect(result.currentPage).toBe(2);
    expect(result.hasMore).toBe(false);
    expect(result.stoppedByScanLimit).toBe(false);
  });
});
