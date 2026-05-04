import { useCallback, useEffect, useState } from 'react';
import {
  economyService,
  EconomyBalance,
  Currency,
  LedgerEntry,
} from '../libs/services/economy/economy-service';

export interface UseEconomyResult {
  balance: EconomyBalance;
  loading: boolean;
  earn: (currency: Currency, amount: number, reason: string) => Promise<number>;
  spend: (currency: Currency, amount: number, reason: string) => Promise<number>;
  ledger: (currency?: Currency, limit?: number) => Promise<LedgerEntry[]>;
}

export function useEconomy(): UseEconomyResult {
  const [balance, setBalance] = useState<EconomyBalance>({ coins: 0, shards: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    economyService
      .getBalance()
      .then((current) => {
        if (mounted) {
          setBalance(current);
          setLoading(false);
        }
      })
      .catch(() => {
        if (mounted) setLoading(false);
      });
    const unsub = economyService.subscribe((next) => {
      if (mounted) setBalance(next);
    });
    return () => {
      mounted = false;
      unsub();
    };
  }, []);

  const earn = useCallback(async (currency: Currency, amount: number, reason: string) => {
    return economyService.earn(currency, amount, reason);
  }, []);

  const spend = useCallback(async (currency: Currency, amount: number, reason: string) => {
    return economyService.spend(currency, amount, reason);
  }, []);

  const ledger = useCallback((currency?: Currency, limit?: number) => {
    return economyService.ledger(currency, limit);
  }, []);

  return { balance, loading, earn, spend, ledger };
}
