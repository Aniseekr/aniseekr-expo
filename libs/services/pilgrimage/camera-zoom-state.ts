export interface ShouldReseedZoomStateInput {
  currentZoom: number;
  previousInitialZoom: number;
  epsilon?: number;
}

const DEFAULT_EPSILON = 0.0001;

function isFiniteNumber(value: number): boolean {
  return Number.isFinite(value);
}

export function shouldReseedZoomState({
  currentZoom,
  previousInitialZoom,
  epsilon = DEFAULT_EPSILON,
}: ShouldReseedZoomStateInput): boolean {
  if (!isFiniteNumber(currentZoom)) return true;
  if (!isFiniteNumber(previousInitialZoom)) return true;
  return Math.abs(currentZoom - previousInitialZoom) <= epsilon;
}
