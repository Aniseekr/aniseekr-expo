export type SensorDelta = (previous: number, next: number) => number;

interface ShouldPublishSensorSnapshotInput {
  previousValue: number | null;
  lastPublishedAtMs: number | null;
  nextValue: number;
  nowMs: number;
  minDelta: number;
  minIntervalMs: number;
  maxIntervalMs: number;
  delta?: SensorDelta;
}

export function circularDegreesDelta(previous: number, next: number): number {
  const normalized = Math.abs(((((next - previous + 540) % 360) + 360) % 360) - 180);
  return normalized === 180 ? 180 : normalized;
}

export function shouldPublishSensorSnapshot({
  previousValue,
  lastPublishedAtMs,
  nextValue,
  nowMs,
  minDelta,
  minIntervalMs,
  maxIntervalMs,
  delta = (previous, next) => Math.abs(next - previous),
}: ShouldPublishSensorSnapshotInput): boolean {
  if (!Number.isFinite(nextValue)) return false;
  if (previousValue === null || lastPublishedAtMs === null) return true;

  const elapsedMs = Math.max(0, nowMs - lastPublishedAtMs);
  if (elapsedMs >= maxIntervalMs) return true;
  if (elapsedMs < minIntervalMs) return false;

  return delta(previousValue, nextValue) >= minDelta;
}
