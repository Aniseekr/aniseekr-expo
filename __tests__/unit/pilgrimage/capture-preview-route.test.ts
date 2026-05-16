import { describe, expect, it } from 'bun:test';

import { buildCaptureSessionShotFromRoute } from '../../../libs/services/pilgrimage/capture-preview-route';
import type { RouterParams } from '../../../libs/utils/route-params';

describe('capture preview route shot hydration', () => {
  it('hydrates a real album shot from route params when the live capture session is empty', () => {
    const params: RouterParams = {
      spotId: 'spot-7',
      shotUri: 'file:///album/shot.jpg',
      shotWidth: '1440',
      shotHeight: '1080',
      capturedAt: '1710000000000',
      heading: '182.4',
      distanceMeters: '12.5',
      headingDeltaDeg: '-4.25',
      tilt: '1.5',
    };

    expect(buildCaptureSessionShotFromRoute(params)).toEqual({
      id: 'route:spot-7:1710000000000:file:///album/shot.jpg',
      uri: 'file:///album/shot.jpg',
      width: 1440,
      height: 1080,
      captureMode: 'single',
      source: 'manual',
      createdAt: 1710000000000,
      heading: 182.4,
      distanceMeters: 12.5,
      headingDeltaDeg: -4.25,
      tilt: 1.5,
    });
  });

  it('returns null when the route does not carry a shot uri', () => {
    expect(buildCaptureSessionShotFromRoute({ spotId: 'spot-7' })).toBeNull();
  });
});
