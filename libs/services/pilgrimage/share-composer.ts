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
