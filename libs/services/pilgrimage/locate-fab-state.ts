// Pure state-machine for the pilgrimage locate FAB.
//
// Lives in its own file (no React, no react-native, no expo imports) so the
// idle → following → compass cycle, the permission gating, and the
// once-per-session settings-sheet rule can be unit-tested without spinning
// up react-native or expo-location. The full hook (`useUserLocationTracking`)
// consumes this module to keep its implementation honest with the tests.

export type LocateFollowState = 'idle' | 'following' | 'compass';
export type LocatePermissionState = 'undetermined' | 'granted' | 'denied' | 'blocked';

/**
 * Outcome of a single FAB tap decision.
 *
 *   - 'cycle'                   → permission is granted; rotate the FAB
 *                                  state machine to `nextFollow`.
 *   - 'request'                 → permission is undetermined or denied
 *                                  (canAskAgain). Caller should show the OS
 *                                  prompt and then re-evaluate.
 *   - 'showSettingsSheet'       → permission is blocked (canAskAgain=false).
 *                                  No point re-prompting; surface the
 *                                  Settings sheet (once per session).
 *   - 'noopAlreadyShowingSheet' → sheet already shown this session and the
 *                                  user dismissed it; FAB tap is a no-op.
 */
export type LocateFabDecision =
  | { kind: 'cycle'; nextFollow: LocateFollowState }
  | { kind: 'request' }
  | { kind: 'showSettingsSheet' }
  | { kind: 'noopAlreadyShowingSheet' };

/**
 * Pure state-machine resolver for a FAB tap.
 */
export function resolveLocateFabDecision(input: {
  current: LocateFollowState;
  permission: LocatePermissionState;
  sheetShownThisSession: boolean;
}): LocateFabDecision {
  const { current, permission, sheetShownThisSession } = input;
  if (permission === 'blocked') {
    return sheetShownThisSession
      ? { kind: 'noopAlreadyShowingSheet' }
      : { kind: 'showSettingsSheet' };
  }
  if (permission !== 'granted') {
    return { kind: 'request' };
  }
  const nextFollow: LocateFollowState =
    current === 'idle' ? 'following' : current === 'following' ? 'compass' : 'idle';
  return { kind: 'cycle', nextFollow };
}
