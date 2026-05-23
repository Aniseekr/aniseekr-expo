import { beforeEach, describe, expect, it } from 'bun:test';

import {
  appStorage,
  kvGet,
  kvRemove,
  kvSet,
  __resetAppStorageForTests,
} from '../../../libs/services/storage/app-storage';

beforeEach(() => {
  appStorage.clearAll();
  __resetAppStorageForTests();
});

describe('kv sync accessors', () => {
  it('round-trips a string value', () => {
    kvSet('demo', 'hello');
    expect(kvGet('demo')).toBe('hello');
  });

  it('returns null for a missing key', () => {
    expect(kvGet('never-written')).toBeNull();
  });

  it('removes a key', () => {
    kvSet('demo', 'hello');
    kvRemove('demo');
    expect(kvGet('demo')).toBeNull();
  });
});
