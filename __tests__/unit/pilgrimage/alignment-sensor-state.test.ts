import { describe, expect, it } from 'bun:test';
import {
  circularDegreesDelta,
  shouldPublishSensorSnapshot,
} from '../../../libs/services/pilgrimage/alignment-sensor-state';

describe('alignment sensor snapshot publishing', () => {
  it('publishes the first finite reading immediately', () => {
    expect(
      shouldPublishSensorSnapshot({
        previousValue: null,
        lastPublishedAtMs: null,
        nextValue: 42,
        nowMs: 1000,
        minDelta: 2,
        minIntervalMs: 250,
        maxIntervalMs: 1000,
      })
    ).toBe(true);
  });

  it('suppresses meaningful changes before the minimum interval', () => {
    expect(
      shouldPublishSensorSnapshot({
        previousValue: 10,
        lastPublishedAtMs: 1000,
        nextValue: 18,
        nowMs: 1100,
        minDelta: 2,
        minIntervalMs: 250,
        maxIntervalMs: 1000,
      })
    ).toBe(false);
  });

  it('publishes meaningful changes once the minimum interval has elapsed', () => {
    expect(
      shouldPublishSensorSnapshot({
        previousValue: 10,
        lastPublishedAtMs: 1000,
        nextValue: 12.5,
        nowMs: 1250,
        minDelta: 2,
        minIntervalMs: 250,
        maxIntervalMs: 1000,
      })
    ).toBe(true);
  });

  it('suppresses small jitter until the stale interval elapses', () => {
    expect(
      shouldPublishSensorSnapshot({
        previousValue: 10,
        lastPublishedAtMs: 1000,
        nextValue: 10.6,
        nowMs: 1500,
        minDelta: 2,
        minIntervalMs: 250,
        maxIntervalMs: 1000,
      })
    ).toBe(false);
  });

  it('publishes a stale snapshot even when movement is below the jitter threshold', () => {
    expect(
      shouldPublishSensorSnapshot({
        previousValue: 10,
        lastPublishedAtMs: 1000,
        nextValue: 10.6,
        nowMs: 2000,
        minDelta: 2,
        minIntervalMs: 250,
        maxIntervalMs: 1000,
      })
    ).toBe(true);
  });

  it('uses shortest-arc deltas for compass headings', () => {
    expect(circularDegreesDelta(359, 1)).toBe(2);
    expect(
      shouldPublishSensorSnapshot({
        previousValue: 359,
        lastPublishedAtMs: 1000,
        nextValue: 1,
        nowMs: 1300,
        minDelta: 5,
        minIntervalMs: 250,
        maxIntervalMs: 1000,
        delta: circularDegreesDelta,
      })
    ).toBe(false);
  });
});
