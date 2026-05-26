// Composer-state helpers for the share card. These are pure functions so
// they can be unit-tested without a React renderer; the ShareCard component
// consumes them at render time. Track A of the composer pipeline plan
// (2026-05-26-composer-pipeline.md) — feature #1 (custom background),
// #2 (image-pair order swap), #3 (custom text watermark), #6 (export
// resolution).

import { describe, expect, it } from 'bun:test';
import {
  EXPORT_RESOLUTIONS,
  TEMPLATE_DEFAULT_BG,
  WATERMARK_MAX_LENGTH,
  WATERMARK_POSITIONS,
  getExportDimensions,
  getWatermarkAlignment,
  normalizeWatermarkText,
  resolveBackgroundColor,
  resolveImagePairOrder,
} from '../../../libs/services/pilgrimage/share-composer';

describe('share composer · background color', () => {
  it('returns each template’s built-in canvas color when no override is set', () => {
    expect(resolveBackgroundColor('polaroid', null, '#222')).toBe(TEMPLATE_DEFAULT_BG.polaroid);
    expect(resolveBackgroundColor('minimal', null, '#222')).toBe(TEMPLATE_DEFAULT_BG.minimal);
    expect(resolveBackgroundColor('comic', null, '#222')).toBe(TEMPLATE_DEFAULT_BG.comic);
    expect(resolveBackgroundColor('manga', null, '#222')).toBe(TEMPLATE_DEFAULT_BG.manga);
  });

  it('falls back to the theme surface for templates that have no hardcoded canvas', () => {
    // `classic` is theme-driven — it must not fight the theme surface.
    expect(resolveBackgroundColor('classic', null, '#1A1A1A')).toBe('#1A1A1A');
  });

  it('honours a user-picked override on every template', () => {
    expect(resolveBackgroundColor('polaroid', '#0a84ff', '#222')).toBe('#0a84ff');
    expect(resolveBackgroundColor('classic', '#0a84ff', '#222')).toBe('#0a84ff');
    expect(resolveBackgroundColor('minimal', '#0a84ff', '#222')).toBe('#0a84ff');
  });

  it('rejects malformed hex overrides — falls back to template default', () => {
    expect(resolveBackgroundColor('polaroid', 'not-a-color', '#222')).toBe(
      TEMPLATE_DEFAULT_BG.polaroid
    );
    expect(resolveBackgroundColor('polaroid', '', '#222')).toBe(TEMPLATE_DEFAULT_BG.polaroid);
  });
});

describe('share composer · image-pair order', () => {
  it('puts the anime reference first by default', () => {
    expect(resolveImagePairOrder(false)).toEqual({ first: 'anime', second: 'real' });
  });

  it('swaps so the user shot appears first when swapOrder is true', () => {
    expect(resolveImagePairOrder(true)).toEqual({ first: 'real', second: 'anime' });
  });
});

describe('share composer · watermark text', () => {
  it('returns null for missing input so the component skips rendering', () => {
    expect(normalizeWatermarkText(null)).toBeNull();
    expect(normalizeWatermarkText(undefined)).toBeNull();
    expect(normalizeWatermarkText('')).toBeNull();
    expect(normalizeWatermarkText('   ')).toBeNull();
  });

  it('trims surrounding whitespace and preserves inner spaces', () => {
    expect(normalizeWatermarkText('  京都の旅  ')).toBe('京都の旅');
    expect(normalizeWatermarkText('hello   world')).toBe('hello   world');
  });

  it('caps length at WATERMARK_MAX_LENGTH characters', () => {
    const long = 'a'.repeat(WATERMARK_MAX_LENGTH + 50);
    const out = normalizeWatermarkText(long);
    expect(out).not.toBeNull();
    expect(out!.length).toBe(WATERMARK_MAX_LENGTH);
  });

  it('strips HTML so user text can never inject markup into the rendered card', () => {
    expect(normalizeWatermarkText('<b>bold</b>')).toBe('bold');
    expect(normalizeWatermarkText('hi <script>alert(1)</script>')).toBe('hi alert(1)');
  });
});

describe('share composer · watermark alignment', () => {
  it('exports a stable list of five corner/center positions', () => {
    expect(WATERMARK_POSITIONS).toEqual([
      'topLeft',
      'topRight',
      'bottomLeft',
      'bottomRight',
      'center',
    ]);
  });

  it('pins each corner with the configured padding', () => {
    expect(getWatermarkAlignment('topLeft', 12)).toMatchObject({ top: 12, left: 12 });
    expect(getWatermarkAlignment('topRight', 12)).toMatchObject({ top: 12, right: 12 });
    expect(getWatermarkAlignment('bottomLeft', 12)).toMatchObject({ bottom: 12, left: 12 });
    expect(getWatermarkAlignment('bottomRight', 12)).toMatchObject({ bottom: 12, right: 12 });
  });

  it('center uses parent flex alignment so the layout stays portable', () => {
    const out = getWatermarkAlignment('center', 12);
    expect(out.top).toBe(0);
    expect(out.left).toBe(0);
    expect(out.right).toBe(0);
    expect(out.bottom).toBe(0);
    expect(out.alignItems).toBe('center');
    expect(out.justifyContent).toBe('center');
  });
});

describe('share composer · export dimensions', () => {
  it('exports three resolution presets at 720 / 1080 / 2160 short-edge', () => {
    const bases = EXPORT_RESOLUTIONS.map((r) => r.base);
    expect(bases).toEqual([720, 1080, 2160]);
  });

  it('returns square dimensions for 1:1', () => {
    expect(getExportDimensions('1:1', '720p')).toEqual({ width: 720, height: 720 });
    expect(getExportDimensions('1:1', '1080p')).toEqual({ width: 1080, height: 1080 });
    expect(getExportDimensions('1:1', '4k')).toEqual({ width: 2160, height: 2160 });
  });

  it('keeps the short edge as the base for portrait 9:16', () => {
    expect(getExportDimensions('9:16', '720p')).toEqual({ width: 720, height: 1280 });
    expect(getExportDimensions('9:16', '1080p')).toEqual({ width: 1080, height: 1920 });
    expect(getExportDimensions('9:16', '4k')).toEqual({ width: 2160, height: 3840 });
  });

  it('keeps the short edge as the base for landscape 16:9', () => {
    expect(getExportDimensions('16:9', '720p')).toEqual({ width: 1280, height: 720 });
    expect(getExportDimensions('16:9', '1080p')).toEqual({ width: 1920, height: 1080 });
    expect(getExportDimensions('16:9', '4k')).toEqual({ width: 3840, height: 2160 });
  });
});
