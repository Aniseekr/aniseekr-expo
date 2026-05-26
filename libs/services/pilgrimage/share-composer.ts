// Composer state for the share card (Track A of the composer pipeline plan:
// docs/superpowers/plans/2026-05-26-composer-pipeline.md).
//
// These are pure helpers — no React, no react-native. They are the
// "below-the-render" layer shared by the pilgrimage compare flow and the
// upcoming Companion composer entry point, so the same rules govern how
// background color, image order, watermark text, and export resolution
// behave in either context.

import type { ShareRatio, ShareTemplate } from '../../../components/pilgrimage/ShareCard';

// ----- background color -----

/**
 * Each template has a built-in canvas color. `classic` is left empty so the
 * resolver falls back to the runtime theme surface (the template is the only
 * one that already reads `theme.background.secondary`).
 */
export const TEMPLATE_DEFAULT_BG: Record<ShareTemplate, string> = {
  polaroid: '#F5F1E8',
  classic: '',
  minimal: '#000000',
  comic: '#FFE45C',
  manga: '#FFFFFF',
};

const HEX_COLOR_RE = /^#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})$/;

function isValidHex(value: string | null | undefined): value is string {
  return typeof value === 'string' && HEX_COLOR_RE.test(value);
}

/**
 * Pick the canvas color for a template. Priority:
 *   1. user-picked override (only if it's a valid 3/6-digit hex)
 *   2. template-default
 *   3. theme surface fallback (used by templates with no hardcoded canvas)
 */
export function resolveBackgroundColor(
  template: ShareTemplate,
  customBg: string | null | undefined,
  themeFallback: string
): string {
  if (isValidHex(customBg)) return customBg;
  const builtin = TEMPLATE_DEFAULT_BG[template];
  if (builtin) return builtin;
  return themeFallback;
}

// ----- image pair order -----

export type ImagePairSlot = 'anime' | 'real';
export type ImagePairOrder = { first: ImagePairSlot; second: ImagePairSlot };

export function resolveImagePairOrder(swapOrder: boolean): ImagePairOrder {
  return swapOrder
    ? { first: 'real', second: 'anime' }
    : { first: 'anime', second: 'real' };
}

// ----- watermark text -----

export const WATERMARK_MAX_LENGTH = 80;

const HTML_TAG_RE = /<[^>]*>/g;

/**
 * Watermark text comes from a free-text input, so it has to be sanitised
 * before it goes anywhere near the rendered card. We strip any HTML-looking
 * markup (the rendered output is plain `<Text>`, so tags would either pass
 * through as literal text or — in some future Skia/web target — be parsed).
 * Then we trim and cap length so a runaway paste never explodes the layout.
 */
export function normalizeWatermarkText(input: string | null | undefined): string | null {
  if (typeof input !== 'string') return null;
  const stripped = input.replace(HTML_TAG_RE, '');
  const trimmed = stripped.trim();
  if (!trimmed) return null;
  if (trimmed.length <= WATERMARK_MAX_LENGTH) return trimmed;
  return trimmed.slice(0, WATERMARK_MAX_LENGTH);
}

// ----- watermark alignment -----

export type WatermarkPosition = 'topLeft' | 'topRight' | 'bottomLeft' | 'bottomRight' | 'center';

export const WATERMARK_POSITIONS: WatermarkPosition[] = [
  'topLeft',
  'topRight',
  'bottomLeft',
  'bottomRight',
  'center',
];

export type WatermarkAlignment = {
  position: 'absolute';
  top?: number;
  right?: number;
  bottom?: number;
  left?: number;
  alignItems?: 'flex-start' | 'flex-end' | 'center';
  justifyContent?: 'flex-start' | 'flex-end' | 'center';
};

/**
 * Translate a logical position label into a flat style object the watermark
 * `<View>` can spread. Corner positions pin via top/left/right/bottom. Center
 * uses a full-bleed `absoluteFill`-style box with flex centering so the inner
 * text can grow without the math having to know its size.
 */
export function getWatermarkAlignment(
  position: WatermarkPosition,
  padding: number
): WatermarkAlignment {
  if (position === 'center') {
    return {
      position: 'absolute',
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
      alignItems: 'center',
      justifyContent: 'center',
    };
  }
  const base: WatermarkAlignment = { position: 'absolute' };
  if (position === 'topLeft' || position === 'topRight') base.top = padding;
  if (position === 'bottomLeft' || position === 'bottomRight') base.bottom = padding;
  if (position === 'topLeft' || position === 'bottomLeft') base.left = padding;
  if (position === 'topRight' || position === 'bottomRight') base.right = padding;
  return base;
}

// ----- watermark font + color (Phase 2) -----

export type WatermarkFontId = 'system' | 'serif' | 'mono' | 'bold' | 'cursive';

export type WatermarkFontDescriptor = {
  id: WatermarkFontId;
  label: string;
  /** Family string consumed by `<Text style={{ fontFamily }}>`. */
  fontFamily?: string;
  letterSpacing: number;
  fontWeight?: '400' | '600' | '700';
};

/**
 * Watermark fonts are intentionally **system-only** — no asset bundling.
 * Each platform's native fallback lookup picks a real face, so we never end
 * up rendering a missing font (which would silently show as system anyway).
 */
export const WATERMARK_FONTS: WatermarkFontDescriptor[] = [
  { id: 'system', label: 'System', fontFamily: undefined, letterSpacing: 0.5 },
  { id: 'serif', label: 'Serif', fontFamily: 'Georgia', letterSpacing: 0.3 },
  { id: 'mono', label: 'Mono', fontFamily: 'Menlo', letterSpacing: 0 },
  { id: 'bold', label: 'Bold', fontFamily: undefined, letterSpacing: 0.6, fontWeight: '700' },
  { id: 'cursive', label: 'Cursive', fontFamily: 'Snell Roundhand', letterSpacing: 0.4 },
];

export function getWatermarkFontStyle(id: WatermarkFontId | string): {
  fontFamily?: string;
  letterSpacing: number;
  fontWeight?: '400' | '600' | '700';
} {
  const found = WATERMARK_FONTS.find((f) => f.id === id);
  if (!found) {
    const sys = WATERMARK_FONTS[0];
    return { fontFamily: sys.fontFamily, letterSpacing: sys.letterSpacing };
  }
  return {
    fontFamily: found.fontFamily,
    letterSpacing: found.letterSpacing,
    fontWeight: found.fontWeight,
  };
}

const HEX_COLOR_LOOSE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

/**
 * Pick the watermark ink colour. A user-picked override wins (validated as
 * 3/6-digit hex); otherwise we derive the auto-contrast ink from the canvas
 * so the text stays legible by default.
 *
 * Mirrors the `readableTextOn` logic inline so this file stays free of a
 * React-Native dependency (`components/themed/contrast.ts` re-exports the
 * same constants).
 */
export function resolveWatermarkColor(
  override: string | null | undefined,
  canvasBg: string
): string {
  if (typeof override === 'string' && HEX_COLOR_LOOSE.test(override)) return override;
  return autoContrastInk(canvasBg);
}

const ON_DARK_INK = '#FFFFFF';
const ON_LIGHT_INK = '#0E0A06';

function autoContrastInk(canvasBg: string): string {
  if (typeof canvasBg !== 'string') return ON_DARK_INK;
  const m = canvasBg.trim().match(/^#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})$/);
  if (!m) return ON_DARK_INK;
  let hex = m[1];
  if (hex.length === 3) hex = hex.split('').map((c) => c + c).join('');
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  const luminance = srgbLuma(r) * 0.2126 + srgbLuma(g) * 0.7152 + srgbLuma(b) * 0.0722;
  // WCAG: white-on-bg ratio = (1.05) / (luminance + 0.05). >= 3 → use white.
  const whiteRatio = 1.05 / (luminance + 0.05);
  return whiteRatio >= 3 ? ON_DARK_INK : ON_LIGHT_INK;
}

function srgbLuma(c8: number): number {
  const s = c8 / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

// ----- export resolution -----

export type ExportResolution = '720p' | '1080p' | '4k';

export type ExportResolutionDescriptor = {
  id: ExportResolution;
  label: string;
  hint: string;
  /** Short-edge target size in pixels. */
  base: number;
};

export const EXPORT_RESOLUTIONS: ExportResolutionDescriptor[] = [
  { id: '720p', label: '720p', hint: 'Fast', base: 720 },
  { id: '1080p', label: '1080p', hint: 'HD', base: 1080 },
  { id: '4k', label: '4K', hint: 'Sharp', base: 2160 },
];

const RATIO_TO_ASPECT: Record<ShareRatio, number> = {
  '1:1': 1,
  '9:16': 9 / 16,
  '16:9': 16 / 9,
};

/**
 * Output pixel dimensions for `captureRef({ width, height })`. The short edge
 * matches the chosen preset; the long edge is derived from the ratio so the
 * card never gets cropped or letter-boxed at export time.
 */
export function getExportDimensions(
  ratio: ShareRatio,
  resolution: ExportResolution
): { width: number; height: number } {
  const desc = EXPORT_RESOLUTIONS.find((r) => r.id === resolution);
  const base = desc ? desc.base : 1080;
  const aspect = RATIO_TO_ASPECT[ratio];
  if (aspect >= 1) {
    return { width: Math.round(base * aspect), height: base };
  }
  return { width: base, height: Math.round(base / aspect) };
}
