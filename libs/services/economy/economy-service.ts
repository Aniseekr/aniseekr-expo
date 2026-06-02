import { LocalDB } from '../../db';

export type Currency = 'coins' | 'shards';

export interface EconomyBalance {
  coins: number;
  shards: number;
}

export interface LedgerEntry {
  id: number;
  currency: Currency;
  delta: number;
  balanceAfter: number;
  reason: string;
  metadata?: Record<string, unknown>;
  createdAt: number;
}

type Listener = (balance: EconomyBalance) => void;

class EconomyService {
  private static instance: EconomyService;
  private listeners = new Set<Listener>();
  private cached: EconomyBalance = { coins: 0, shards: 0 };
  private hydrated = false;

  static getInstance(): EconomyService {
    if (!EconomyService.instance) {
      EconomyService.instance = new EconomyService();
    }
    return EconomyService.instance;
  }

  async getBalance(): Promise<EconomyBalance> {
    if (!this.hydrated) {
      await this.hydrate();
    }
    return { ...this.cached };
  }

  async earn(
    currency: Currency,
    amount: number,
    reason: string,
    metadata?: Record<string, unknown>
  ): Promise<number> {
    if (amount <= 0) throw new Error('amount must be positive');
    return this.applyDelta(currency, amount, reason, metadata);
  }

  async spend(
    currency: Currency,
    amount: number,
    reason: string,
    metadata?: Record<string, unknown>
  ): Promise<number> {
    if (amount <= 0) throw new Error('amount must be positive');
    if (!this.hydrated) await this.hydrate();
    if (this.cached[currency] < amount) {
      throw new Error(`Insufficient ${currency}`);
    }
    return this.applyDelta(currency, -amount, reason, metadata);
  }

  async ledger(currency?: Currency, limit = 50): Promise<LedgerEntry[]> {
    const db = await LocalDB.getDatabase();
    const rows = currency
      ? await db.getAllAsync<{
          id: number;
          currency: string;
          delta: number;
          balance_after: number;
          reason: string;
          metadata: string | null;
          created_at: number;
        }>(
          `SELECT id, currency, delta, balance_after, reason, metadata, created_at
           FROM economy_ledger WHERE currency = ?
           ORDER BY created_at DESC LIMIT ?`,
          currency,
          limit
        )
      : await db.getAllAsync<{
          id: number;
          currency: string;
          delta: number;
          balance_after: number;
          reason: string;
          metadata: string | null;
          created_at: number;
        }>(
          `SELECT id, currency, delta, balance_after, reason, metadata, created_at
           FROM economy_ledger ORDER BY created_at DESC LIMIT ?`,
          limit
        );

    return rows.map((row) => ({
      id: row.id,
      currency: row.currency as Currency,
      delta: row.delta,
      balanceAfter: row.balance_after,
      reason: row.reason,
      metadata: row.metadata ? safeJson(row.metadata) : undefined,
      createdAt: row.created_at,
    }));
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    if (this.hydrated) listener({ ...this.cached });
    return () => this.listeners.delete(listener);
  }

  private async applyDelta(
    currency: Currency,
    delta: number,
    reason: string,
    metadata?: Record<string, unknown>
  ): Promise<number> {
    if (!this.hydrated) await this.hydrate();
    const db = await LocalDB.getDatabase();
    const now = Date.now();
    const next = Math.max(0, this.cached[currency] + delta);

    await db.withExclusiveTransactionAsync(async (tx) => {
      await tx.runAsync(
        `INSERT INTO economy_balance (currency, amount, updated_at)
         VALUES (?, ?, ?)
         ON CONFLICT(currency) DO UPDATE SET amount = excluded.amount, updated_at = excluded.updated_at`,
        currency,
        next,
        now
      );
      await tx.runAsync(
        `INSERT INTO economy_ledger
         (currency, delta, balance_after, reason, metadata, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        currency,
        delta,
        next,
        reason,
        metadata ? JSON.stringify(metadata) : null,
        now
      );
    });

    this.cached = { ...this.cached, [currency]: next };
    this.notify();
    return next;
  }

  private async hydrate(): Promise<void> {
    const db = await LocalDB.getDatabase();
    const rows = await db.getAllAsync<{ currency: string; amount: number }>(
      `SELECT currency, amount FROM economy_balance`
    );
    const next: EconomyBalance = { coins: 0, shards: 0 };
    for (const row of rows) {
      if (row.currency === 'coins' || row.currency === 'shards') {
        next[row.currency] = row.amount;
      }
    }
    this.cached = next;
    this.hydrated = true;
    this.notify();
  }

  private notify(): void {
    const snapshot = { ...this.cached };
    this.listeners.forEach((listener) => listener(snapshot));
  }
}

function safeJson(raw: string): Record<string, unknown> {
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

export const economyService = EconomyService.getInstance();
