import { describe, expect, it } from 'bun:test';

describe('subject lifter config plugin', () => {
  it('uses the resolvable Google Play services ML Kit subject segmentation artifact', async () => {
    const source = await Bun.file('plugins/with-subject-lifter.js').text();

    expect(source).toContain(
      'com.google.android.gms:play-services-mlkit-subject-segmentation:16.0.0-beta1'
    );
    expect(source).not.toContain('com.google.mlkit:subject-segmentation:16.0.0-beta1');
  });
});
