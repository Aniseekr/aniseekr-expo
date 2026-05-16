import { describe, expect, it } from 'bun:test';
import {
  resolveSubjectCompositePlan,
  shouldCompositeSubjectOverlay,
} from '../../../libs/services/pilgrimage/subject-composite-plan';

describe('subject composite capture planning', () => {
  it('only composites when subject mode and the user enabled it', () => {
    expect(
      shouldCompositeSubjectOverlay({
        mode: 'subject',
        enabled: true,
        subjectReady: true,
      })
    ).toBe(true);
    expect(
      shouldCompositeSubjectOverlay({
        mode: 'subject',
        enabled: false,
        subjectReady: true,
      })
    ).toBe(false);
    expect(
      shouldCompositeSubjectOverlay({
        mode: 'edge',
        enabled: true,
        subjectReady: true,
      })
    ).toBe(false);
    expect(
      shouldCompositeSubjectOverlay({
        mode: 'subject',
        enabled: true,
        subjectReady: false,
      })
    ).toBe(false);
  });

  it('fits the subject reference into the captured photo and scales screen translation', () => {
    const plan = resolveSubjectCompositePlan({
      photoWidth: 4000,
      photoHeight: 3000,
      previewWidth: 2000,
      previewHeight: 1500,
      subjectWidth: 1920,
      subjectHeight: 1080,
      opacity: 0.35,
      transform: {
        scale: 1.5,
        translateX: 50,
        translateY: -24,
        rotationRad: Math.PI / 6,
        flipScaleX: -1,
      },
    });

    expect(plan).toEqual({
      srcRect: { x: 0, y: 0, width: 1920, height: 1080 },
      dstRect: { x: 0, y: 375, width: 4000, height: 2250 },
      centerX: 2000,
      centerY: 1500,
      translateX: 100,
      translateY: -48,
      scale: 1.5,
      rotationDeg: 30,
      flipScaleX: -1,
      opacity: 0.35,
    });
  });

  it('rejects invalid dimensions instead of inventing a placement', () => {
    expect(
      resolveSubjectCompositePlan({
        photoWidth: 0,
        photoHeight: 3000,
        previewWidth: 2000,
        previewHeight: 1500,
        subjectWidth: 1920,
        subjectHeight: 1080,
        opacity: 0.35,
        transform: {
          scale: 1,
          translateX: 0,
          translateY: 0,
          rotationRad: 0,
          flipScaleX: 1,
        },
      })
    ).toBeNull();
  });
});
