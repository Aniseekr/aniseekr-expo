// Anitabi serves scene images via its CDN with a `?plan=hXXX` size token —
// `?plan=h160` is the default ~284×160 thumbnail used in lists, maps, and
// card decks (~12 KB). Dropping the param returns the original 1920×1080
// frame (~200 KB). Higher `plan=` values like `h720`/`h1080` are NOT served
// (verified — CDN returns 404). So "go big" means "drop the param".
//
// Use this ONLY for the compare overlay / comparison preview — the one place
// where the user actually frames a real-world shot against the anime still
// and pixelation is visible. Everywhere else keeps the thumbnail.

import { normalizeBangumiImage } from '../../clients/bangumi-client';

const ANITABI_IMAGE_BASE = 'https://image.anitabi.cn';
const DEFAULT_THUMBNAIL_PLAN = 'h160';

export function normalizeAnitabiImageUrl(
  url: string | null | undefined,
  bangumiId: number
): string {
  const normalized = normalizeBangumiImage(url);
  if (!normalized) return withDefaultPlan(`${ANITABI_IMAGE_BASE}/bangumi/${bangumiId}.jpg`);
  if (normalized.startsWith('//')) return withDefaultPlan(`https:${normalized}`);
  if (normalized.startsWith('/images/')) {
    return withDefaultPlan(`${ANITABI_IMAGE_BASE}${normalized.slice('/images'.length)}`);
  }
  if (normalized.startsWith('/')) {
    return withDefaultPlan(`${ANITABI_IMAGE_BASE}${normalized}`);
  }
  if (normalized.startsWith(ANITABI_IMAGE_BASE)) return withDefaultPlan(normalized);
  return normalized;
}

export function toFullResImageUrl(url: string): string {
  if (!url) return url;
  const idx = url.search(/[?&]plan=/);
  if (idx < 0) return url;
  const sepChar = url[idx];
  const after = url.indexOf('&', idx + 1);
  const tail = after < 0 ? '' : url.slice(after);
  const head = url.slice(0, idx);
  if (sepChar === '?') {
    return tail ? head + '?' + tail.slice(1) : head;
  }
  return head + tail;
}

function withDefaultPlan(url: string): string {
  if (!url || /[?&]plan=/.test(url)) return url;
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}plan=${DEFAULT_THUMBNAIL_PLAN}`;
}
