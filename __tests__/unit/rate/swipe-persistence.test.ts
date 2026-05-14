import { describe, expect, it, mock } from 'bun:test';
import type { Photo } from '../../../components/rate/types';
import {
  persistSwipeJob,
  type SwipePersistenceJob,
} from '../../../libs/services/rate/swipe-persistence';

const photo = (id: string): Photo => ({
  id,
  title: id,
  url: `https://img.example/${id}.jpg`,
  userId: 'test-user',
  score: 0,
  year: 2024,
});

describe('swipe persistence', () => {
  it('does not reject when markSwipeSeen hits a native SQLite error', async () => {
    const job: SwipePersistenceJob = {
      photo: photo('anime-a'),
      rating: 'like',
      markSeen: true,
    };
    const applyOutcome = mock(async () => undefined);
    const markSwipeSeen = mock(async () => {
      throw new Error('NativeDatabase.prepareAsync rejected');
    });
    const warn = mock(() => undefined);

    await expect(
      persistSwipeJob(job, {
        applyOutcome,
        markSwipeSeen,
        retryDelayMs: 0,
        warn,
      })
    ).resolves.toBeUndefined();

    expect(applyOutcome).toHaveBeenCalledTimes(1);
    expect(markSwipeSeen).toHaveBeenCalledTimes(2);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('retries markSwipeSeen once before giving up', async () => {
    const job: SwipePersistenceJob = {
      photo: photo('anime-b'),
      rating: 'tracking',
      markSeen: true,
    };
    const applyOutcome = mock(async () => undefined);
    let attempts = 0;
    const markSwipeSeen = mock(async () => {
      attempts += 1;
      if (attempts === 1) {
        throw new Error('NativeDatabase.prepareAsync rejected');
      }
    });
    const warn = mock(() => undefined);

    await persistSwipeJob(job, {
      applyOutcome,
      markSwipeSeen,
      retryDelayMs: 0,
      warn,
    });

    expect(markSwipeSeen).toHaveBeenCalledTimes(2);
    expect(warn).toHaveBeenCalledTimes(0);
  });

  it('skips markSwipeSeen when the job was released by restart', async () => {
    const job: SwipePersistenceJob = {
      photo: photo('anime-c'),
      rating: 'skip',
      markSeen: false,
    };
    const applyOutcome = mock(async () => undefined);
    const markSwipeSeen = mock(async () => undefined);

    await persistSwipeJob(job, {
      applyOutcome,
      markSwipeSeen,
      retryDelayMs: 0,
    });

    expect(applyOutcome).toHaveBeenCalledTimes(1);
    expect(markSwipeSeen).toHaveBeenCalledTimes(0);
  });
});
