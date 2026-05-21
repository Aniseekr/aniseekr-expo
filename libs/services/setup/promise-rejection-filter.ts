// Global filter for "noisy but expected" unhandled promise rejections.
//
// React Native's default tracker (`promise/setimmediate/rejection-tracking`,
// installed by `react-native/Libraries/Core/InitializeCore`) surfaces every
// unhandled rejection as a red box / console warning. Two of those rejections
// are NOT bugs — they're documented CameraX behaviour that VisionCamera's
// internal updater bindings don't catch:
//
//   • `Cancelled due to another zoom value being set` — fires from
//     ZoomControl.kt:136. CameraX cancels the previous in-flight setZoomRatio
//     when a new one supersedes it (gesture writes zoomShared at gesture
//     frame rate, ~60–120 Hz; CameraX can't apply that fast, so it cancels
//     mid-flight). The new value DOES land; the rejection is just the
//     cancelled future's awaiter.
//
// We do NOT swallow every CameraX cancellation. `Camera is not active`
// (ZoomControl.kt:160) — fired on a dead controller — is a real race we
// already fixed in `CameraStage` via the `startedForDeviceId` gate; if it
// resurfaces we want to see it. Pattern below is strict.
//
// Implementation note: re-enabling the tracker replaces RN's default
// handler. We forward non-benign rejections to a console.warn that mirrors
// RN's default format so the dev experience for real bugs is unchanged.
//
// Per CLAUDE.md Rule 8: this filter does not suppress real errors. Each
// pattern is justified by the CameraX source line it matches.

interface RejectionTracker {
  enable(opts: {
    allRejections?: boolean;
    onUnhandled?: (id: number, error: unknown) => void;
    onHandled?: (id: number) => void;
  }): void;
}

const BENIGN_PATTERNS: readonly RegExp[] = [
  // CameraX zoom supersession — ZoomControl.kt:136
  /Cancelled due to another zoom value being set/,
];

function isBenignRejection(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const message = (error as { message?: unknown }).message;
  if (typeof message !== 'string') return false;
  return BENIGN_PATTERNS.some((pattern) => pattern.test(message));
}

function defaultUnhandledHandler(id: number, error: unknown): void {
  console.warn(
    `Possible Unhandled Promise Rejection (id: ${id}):`,
    error instanceof Error ? error.stack ?? error.message : String(error)
  );
}

let installed = false;

export function installPromiseRejectionFilter(): void {
  if (installed) return;
  try {
    // The exact module path RN ships in. Importing dynamically so the bundle
    // doesn't fail on platforms that resolve it differently — silently
    // no-op if the module isn't present (matches RN-Web behaviour where
    // rejection tracking lives elsewhere).
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const tracker = require('promise/setimmediate/rejection-tracking') as RejectionTracker;
    tracker.enable({
      allRejections: true,
      onUnhandled: (id, error) => {
        if (isBenignRejection(error)) return;
        defaultUnhandledHandler(id, error);
      },
      onHandled: () => undefined,
    });
    installed = true;
  } catch {
    // Best effort. The default tracker stays in place if the require fails.
  }
}
