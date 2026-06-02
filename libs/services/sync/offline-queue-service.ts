import { LocalDB } from '../../db';
import type { PlatformType, AnimeStatus } from '../auth/types';

export type SyncJobType = 'progress' | 'status' | 'score' | 'add' | 'remove';
export type SyncJobState = 'pending' | 'running' | 'done' | 'dead';

export interface SyncJobPayload {
  animeId: string;
  progress?: number;
  status?: AnimeStatus;
  score?: number;
}

export interface SyncJob {
  id: number;
  jobType: SyncJobType;
  platform: PlatformType;
  payload: SyncJobPayload;
  attempts: number;
  nextAttemptAt: number;
  lastError?: string;
  state: SyncJobState;
  createdAt: number;
  updatedAt: number;
}

const MAX_ATTEMPTS = 5;
const BASE_BACKOFF_MS = 30_000;

export type SyncJobExecutor = (job: SyncJob) => Promise<void>;

interface ProcessResult {
  processed: number;
  succeeded: number;
  failed: number;
  dead: number;
}

class OfflineQueueService {
  private static instance: OfflineQueueService;
  private running = false;

  static getInstance(): OfflineQueueService {
    if (!OfflineQueueService.instance) {
      OfflineQueueService.instance = new OfflineQueueService();
    }
    return OfflineQueueService.instance;
  }

  async enqueue(
    jobType: SyncJobType,
    platform: PlatformType,
    payload: SyncJobPayload
  ): Promise<number> {
    const db = await LocalDB.getDatabase();
    const now = Date.now();
    const result = await db.runAsync(
      `INSERT INTO sync_jobs
       (job_type, platform, payload, attempts, next_attempt_at, state, created_at, updated_at)
       VALUES (?, ?, ?, 0, ?, 'pending', ?, ?)`,
      jobType,
      platform,
      JSON.stringify(payload),
      now,
      now,
      now
    );
    return result.lastInsertRowId;
  }

  async enqueueBatch(
    jobs: { type: SyncJobType; platform: PlatformType; payload: SyncJobPayload }[]
  ): Promise<void> {
    if (jobs.length === 0) return;
    const db = await LocalDB.getDatabase();
    const now = Date.now();
    await db.withExclusiveTransactionAsync(async (tx) => {
      for (const job of jobs) {
        await tx.runAsync(
          `INSERT INTO sync_jobs
           (job_type, platform, payload, attempts, next_attempt_at, state, created_at, updated_at)
           VALUES (?, ?, ?, 0, ?, 'pending', ?, ?)`,
          job.type,
          job.platform,
          JSON.stringify(job.payload),
          now,
          now,
          now
        );
      }
    });
  }

  async listPending(now: number = Date.now(), limit = 50): Promise<SyncJob[]> {
    const db = await LocalDB.getDatabase();
    const rows = await db.getAllAsync<{
      id: number;
      job_type: string;
      platform: string;
      payload: string;
      attempts: number;
      next_attempt_at: number;
      last_error: string | null;
      state: string;
      created_at: number;
      updated_at: number;
    }>(
      `SELECT id, job_type, platform, payload, attempts, next_attempt_at,
              last_error, state, created_at, updated_at
       FROM sync_jobs
       WHERE state = 'pending' AND next_attempt_at <= ?
       ORDER BY next_attempt_at ASC, id ASC
       LIMIT ?`,
      now,
      limit
    );

    return rows.map(rowToJob);
  }

  async getDeadLetter(limit = 100): Promise<SyncJob[]> {
    const db = await LocalDB.getDatabase();
    const rows = await db.getAllAsync<{
      id: number;
      job_type: string;
      platform: string;
      payload: string;
      attempts: number;
      next_attempt_at: number;
      last_error: string | null;
      state: string;
      created_at: number;
      updated_at: number;
    }>(
      `SELECT id, job_type, platform, payload, attempts, next_attempt_at,
              last_error, state, created_at, updated_at
       FROM sync_jobs WHERE state = 'dead'
       ORDER BY updated_at DESC LIMIT ?`,
      limit
    );
    return rows.map(rowToJob);
  }

  async pendingCount(): Promise<number> {
    const db = await LocalDB.getDatabase();
    const row = await db.getFirstAsync<{ count: number }>(
      `SELECT COUNT(*) as count FROM sync_jobs WHERE state = 'pending'`
    );
    return row?.count ?? 0;
  }

  async deadCount(): Promise<number> {
    const db = await LocalDB.getDatabase();
    const row = await db.getFirstAsync<{ count: number }>(
      `SELECT COUNT(*) as count FROM sync_jobs WHERE state = 'dead'`
    );
    return row?.count ?? 0;
  }

  async retryDead(jobId: number): Promise<void> {
    const db = await LocalDB.getDatabase();
    await db.runAsync(
      `UPDATE sync_jobs
       SET state = 'pending', attempts = 0, last_error = NULL,
           next_attempt_at = ?, updated_at = ?
       WHERE id = ?`,
      Date.now(),
      Date.now(),
      jobId
    );
  }

  async removeJob(jobId: number): Promise<void> {
    const db = await LocalDB.getDatabase();
    await db.runAsync(`DELETE FROM sync_jobs WHERE id = ?`, jobId);
  }

  async purgeCompleted(olderThanMs = 7 * 24 * 60 * 60 * 1000): Promise<number> {
    const db = await LocalDB.getDatabase();
    const cutoff = Date.now() - olderThanMs;
    const result = await db.runAsync(
      `DELETE FROM sync_jobs WHERE state = 'done' AND updated_at < ?`,
      cutoff
    );
    return result.changes;
  }

  async drain(executor: SyncJobExecutor, batchSize = 25): Promise<ProcessResult> {
    if (this.running) {
      return { processed: 0, succeeded: 0, failed: 0, dead: 0 };
    }
    this.running = true;
    const summary: ProcessResult = { processed: 0, succeeded: 0, failed: 0, dead: 0 };

    try {
      while (true) {
        const batch = await this.listPending(Date.now(), batchSize);
        if (batch.length === 0) break;

        for (const job of batch) {
          summary.processed += 1;
          await this.markRunning(job.id);
          try {
            await executor(job);
            await this.markDone(job.id);
            summary.succeeded += 1;
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            const nextAttempts = job.attempts + 1;
            if (nextAttempts >= MAX_ATTEMPTS) {
              await this.markDead(job.id, message);
              summary.dead += 1;
            } else {
              await this.markFailed(job.id, nextAttempts, message);
              summary.failed += 1;
            }
          }
        }
      }
    } finally {
      this.running = false;
    }

    return summary;
  }

  private async markRunning(jobId: number): Promise<void> {
    const db = await LocalDB.getDatabase();
    await db.runAsync(
      `UPDATE sync_jobs SET state = 'running', updated_at = ? WHERE id = ?`,
      Date.now(),
      jobId
    );
  }

  private async markDone(jobId: number): Promise<void> {
    const db = await LocalDB.getDatabase();
    await db.runAsync(
      `UPDATE sync_jobs SET state = 'done', updated_at = ? WHERE id = ?`,
      Date.now(),
      jobId
    );
  }

  private async markFailed(jobId: number, attempts: number, error: string): Promise<void> {
    const db = await LocalDB.getDatabase();
    const backoff = BASE_BACKOFF_MS * Math.pow(2, attempts - 1);
    const next = Date.now() + backoff;
    await db.runAsync(
      `UPDATE sync_jobs
       SET state = 'pending', attempts = ?, last_error = ?,
           next_attempt_at = ?, updated_at = ?
       WHERE id = ?`,
      attempts,
      error,
      next,
      Date.now(),
      jobId
    );
  }

  private async markDead(jobId: number, error: string): Promise<void> {
    const db = await LocalDB.getDatabase();
    await db.runAsync(
      `UPDATE sync_jobs
       SET state = 'dead', last_error = ?, updated_at = ?
       WHERE id = ?`,
      error,
      Date.now(),
      jobId
    );
  }
}

function rowToJob(row: {
  id: number;
  job_type: string;
  platform: string;
  payload: string;
  attempts: number;
  next_attempt_at: number;
  last_error: string | null;
  state: string;
  created_at: number;
  updated_at: number;
}): SyncJob {
  let payload: SyncJobPayload;
  try {
    payload = JSON.parse(row.payload) as SyncJobPayload;
  } catch {
    payload = { animeId: '' };
  }
  return {
    id: row.id,
    jobType: row.job_type as SyncJobType,
    platform: row.platform as PlatformType,
    payload,
    attempts: row.attempts,
    nextAttemptAt: row.next_attempt_at,
    lastError: row.last_error ?? undefined,
    state: row.state as SyncJobState,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export const offlineQueueService = OfflineQueueService.getInstance();
