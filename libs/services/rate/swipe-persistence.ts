import type { Photo } from '../../../components/rate/types';
import type { RatingType } from '../../../components/rate/RatingActionButtons';

export interface SwipePersistenceJob {
  photo: Photo;
  rating: RatingType;
  markSeen: boolean;
}

interface SwipePersistenceDeps {
  applyOutcome: (photo: Photo, rating: RatingType) => Promise<void>;
  markSwipeSeen: (animeId: string) => Promise<void>;
  retryDelayMs?: number;
  warn?: (message: string, error: unknown) => void;
}

const DEFAULT_RETRY_DELAY_MS = 100;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runWithSingleRetry(
  label: string,
  operation: () => Promise<void>,
  retryDelayMs: number,
  warn?: (message: string, error: unknown) => void
): Promise<void> {
  try {
    await operation();
    return;
  } catch {
    if (retryDelayMs > 0) {
      await sleep(retryDelayMs);
    }
  }

  try {
    await operation();
  } catch (err) {
    warn?.(`[swipe-persistence] ${label} failed`, err);
  }
}

export async function persistSwipeJob(
  job: SwipePersistenceJob,
  deps: SwipePersistenceDeps
): Promise<void> {
  const retryDelayMs = deps.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS;
  await runWithSingleRetry(
    'applyOutcome',
    () => deps.applyOutcome(job.photo, job.rating),
    retryDelayMs,
    deps.warn
  );

  if (!job.markSeen) return;
  await runWithSingleRetry(
    'markSwipeSeen',
    () => deps.markSwipeSeen(job.photo.id),
    retryDelayMs,
    deps.warn
  );
}
