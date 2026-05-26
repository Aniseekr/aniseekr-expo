// State-machine tests for the locate FAB.
//
// Why pure-function tests:
//   The hook itself (`useUserLocationTracking`) spins up subscriptions and
//   AppState listeners that need react-test-renderer + mocked expo modules.
//   The decision logic — what happens when the user taps the FAB given a
//   given (current state, permission, sheet-shown-already) tuple — is
//   factored out as `resolveLocateFabDecision`, so we can exercise every
//   transition without any of that scaffolding.
//
// Spec cases:
//   PILG-FAB-CYCLE-001..003 — idle → following → compass → idle.
//   PILG-FAB-PERM-001       — undetermined permission requests OS prompt.
//   PILG-FAB-PERM-002       — denied (canAskAgain=true) requests OS prompt.
//   PILG-FAB-PERM-003       — blocked + sheet never shown → show sheet.
//   PILG-FAB-PERM-004       — blocked + sheet already shown → no-op.

import { describe, expect, it } from 'bun:test';
import {
  resolveLocateFabDecision,
  type LocateFollowState,
  type LocatePermissionState,
} from '../../../libs/services/pilgrimage/locate-fab-state';

describe('resolveLocateFabDecision', () => {
  it('PILG-FAB-CYCLE-001 idle → following when permission is granted', () => {
    expect(
      resolveLocateFabDecision({
        current: 'idle',
        permission: 'granted',
        sheetShownThisSession: false,
      })
    ).toEqual({ kind: 'cycle', nextFollow: 'following' });
  });

  it('PILG-FAB-CYCLE-002 following → compass when permission is granted', () => {
    expect(
      resolveLocateFabDecision({
        current: 'following',
        permission: 'granted',
        sheetShownThisSession: false,
      })
    ).toEqual({ kind: 'cycle', nextFollow: 'compass' });
  });

  it('PILG-FAB-CYCLE-003 compass → idle when permission is granted', () => {
    expect(
      resolveLocateFabDecision({
        current: 'compass',
        permission: 'granted',
        sheetShownThisSession: false,
      })
    ).toEqual({ kind: 'cycle', nextFollow: 'idle' });
  });

  it('PILG-FAB-PERM-001 undetermined permission triggers an OS prompt', () => {
    expect(
      resolveLocateFabDecision({
        current: 'idle',
        permission: 'undetermined',
        sheetShownThisSession: false,
      })
    ).toEqual({ kind: 'request' });
  });

  it('PILG-FAB-PERM-002 denied (canAskAgain) still triggers an OS prompt', () => {
    expect(
      resolveLocateFabDecision({
        current: 'idle',
        permission: 'denied',
        sheetShownThisSession: false,
      })
    ).toEqual({ kind: 'request' });
  });

  it('PILG-FAB-PERM-003 blocked permission with no prior sheet → show settings sheet', () => {
    expect(
      resolveLocateFabDecision({
        current: 'idle',
        permission: 'blocked',
        sheetShownThisSession: false,
      })
    ).toEqual({ kind: 'showSettingsSheet' });
  });

  it('PILG-FAB-PERM-004 blocked permission after sheet already shown → no-op', () => {
    expect(
      resolveLocateFabDecision({
        current: 'idle',
        permission: 'blocked',
        sheetShownThisSession: true,
      })
    ).toEqual({ kind: 'noopAlreadyShowingSheet' });
  });

  it('preserves the cycle order across every combination of current state', () => {
    const order: readonly LocateFollowState[] = ['idle', 'following', 'compass'];
    for (let i = 0; i < order.length; i++) {
      const current = order[i];
      const expected = order[(i + 1) % order.length];
      const result = resolveLocateFabDecision({
        current,
        permission: 'granted',
        sheetShownThisSession: false,
      });
      expect(result.kind).toBe('cycle');
      if (result.kind === 'cycle') {
        expect(result.nextFollow).toBe(expected);
      }
    }
  });

  it('non-granted permissions never produce a cycle decision', () => {
    const nonGranted: readonly LocatePermissionState[] = [
      'undetermined',
      'denied',
      'blocked',
    ];
    const states: readonly LocateFollowState[] = ['idle', 'following', 'compass'];
    for (const permission of nonGranted) {
      for (const current of states) {
        const result = resolveLocateFabDecision({
          current,
          permission,
          sheetShownThisSession: false,
        });
        expect(result.kind).not.toBe('cycle');
      }
    }
  });
});
