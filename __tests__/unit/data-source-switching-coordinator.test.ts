import { describe, it, expect, beforeEach } from 'bun:test';
import {
  DataSourceSwitchingCoordinator,
  type SwitchingState,
} from '../../libs/services/data-source-switching-coordinator';
import { QueryClient } from '../../libs/services/query-client';

describe('DataSourceSwitchingCoordinator state machine', () => {
  beforeEach(() => {
    DataSourceSwitchingCoordinator.__resetForTests();
    QueryClient.__resetForTests();
  });

  it('DSSW-001 starts in idle state', () => {
    const coord = DataSourceSwitchingCoordinator.getInstance();
    expect(coord.getState().kind).toBe('idle');
  });

  it('DSSW-002 switching exposes from and to platforms', async () => {
    const coord = DataSourceSwitchingCoordinator.getInstance();
    coord.__setTimings({ switchingDelayMs: 50, completedHoldMs: 50 });

    const states: SwitchingState[] = [];
    coord.subscribe((s) => states.push(s));

    const promise = coord.beginSwitch('anilist', 'bangumi');
    // Synchronous read just after kick-off — must already be switching.
    const first = coord.getState();
    expect(first.kind).toBe('switching');
    if (first.kind === 'switching') {
      expect(first.from).toBe('anilist');
      expect(first.to).toBe('bangumi');
    }
    await promise;

    expect(states.some((s) => s.kind === 'switching')).toBe(true);
    expect(states.some((s) => s.kind === 'completed')).toBe(true);
    expect(states.some((s) => s.kind === 'idle')).toBe(true);
    // Final state is idle.
    expect(coord.getState().kind).toBe('idle');
  });

  it('DSSW-003 completed transitions back to idle after delay', async () => {
    const coord = DataSourceSwitchingCoordinator.getInstance();
    coord.__setTimings({ switchingDelayMs: 0, completedHoldMs: 0 });
    await coord.beginSwitch('anilist', 'bangumi');
    expect(coord.getState().kind).toBe('idle');
  });

  it('DSSW-004 failed state carries error code', () => {
    const coord = DataSourceSwitchingCoordinator.getInstance();
    coord.fail({
      code: 'AUTHENTICATION_REQUIRED',
      message: 'login required',
      platform: 'bangumi',
    });
    const state = coord.getState();
    expect(state.kind).toBe('failed');
    if (state.kind === 'failed') {
      expect(state.error.code).toBe('AUTHENTICATION_REQUIRED');
      expect(state.error.platform).toBe('bangumi');
    }
  });

  it('DSSW-005 clearError returns coordinator to idle', () => {
    const coord = DataSourceSwitchingCoordinator.getInstance();
    coord.fail({ code: 'NETWORK_ERROR', message: 'offline' });
    expect(coord.getState().kind).toBe('failed');
    coord.clearError();
    expect(coord.getState().kind).toBe('idle');
    // Calling clearError when not failed is a no-op (still idle).
    coord.clearError();
    expect(coord.getState().kind).toBe('idle');
  });
});
