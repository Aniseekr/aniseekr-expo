// Fallback aspect (16:9) when the shot dims aren't reported. Matches the
// dominant cinematic anime frame and keeps the stage shape predictable.
export const FULL_MODE_FALLBACK_ASPECT = 16 / 9;
export const FULL_MODE_MIN_HEIGHT = 240;
export const FULL_MODE_MAX_HEIGHT = 560;

/**
 * Stage height for the compare preview's "Full" mode. The stage adopts the
 * user's shot aspect so the snapshot composite captures the whole frame
 * without crop — portrait shots stay portrait, landscape shots stay
 * landscape. Clamped to [{@link FULL_MODE_MIN_HEIGHT},
 * {@link FULL_MODE_MAX_HEIGHT}] so an extreme aspect can't blow out the
 * scrollable layout.
 */
export function resolveFullModeStageHeight(
  stageWidth: number,
  shotWidth: number | null | undefined,
  shotHeight: number | null | undefined
): number {
  if (!Number.isFinite(stageWidth) || stageWidth <= 0) return FULL_MODE_MIN_HEIGHT;
  const w = Number.isFinite(shotWidth) && (shotWidth ?? 0) > 0 ? (shotWidth as number) : 0;
  const h = Number.isFinite(shotHeight) && (shotHeight ?? 0) > 0 ? (shotHeight as number) : 0;
  const aspect = w > 0 && h > 0 ? w / h : FULL_MODE_FALLBACK_ASPECT;
  const height = stageWidth / aspect;
  return Math.max(FULL_MODE_MIN_HEIGHT, Math.min(FULL_MODE_MAX_HEIGHT, height));
}
