// Tracing-paper edge overlay for the pilgrimage compare flow.
// Resolves the remote scene image to a local file (Skia's remote fetch is
// unreliable for large CDN images), decodes it via Skia, runs Sobel edge
// detection (or a softer sketch-style blend) through a `RuntimeEffect` SKSL
// shader, snapshots the result, and exposes it as a React-friendly hook.
// Failures resolve to `{image: null, error}` — never a hash-seeded
// "plausible" placeholder (CLAUDE.md Rule 8).

import { Skia, TileMode, FilterMode, MipmapMode } from '@shopify/react-native-skia';
import type { SkImage, SkRuntimeEffect } from '@shopify/react-native-skia';
import { Image as ExpoImage } from 'expo-image';
import * as FileSystem from 'expo-file-system/legacy';
import { useEffect, useState } from 'react';

export interface EdgeImageOptions {
  threshold?: number;
  inkColor?: string;
  inkOpacity?: number;
}

export interface EdgeImageState {
  edgeImage: SkImage | null;
  loading: boolean;
  error: Error | null;
}

export interface SketchImageOptions {
  inkColor?: string;
  inkOpacity?: number;
}

export interface SketchImageState {
  sketchImage: SkImage | null;
  loading: boolean;
  error: Error | null;
}

const DEFAULT_THRESHOLD = 0.18;
const DEFAULT_INK_COLOR = '#FFFFFF';
const DEFAULT_INK_OPACITY = 1;

const SKSL = `
uniform shader src;
uniform float2 px;
uniform float threshold;
uniform half4 ink;

half luma(half4 c) { return 0.299*c.r + 0.587*c.g + 0.114*c.b; }

half4 main(float2 xy) {
  half tl = luma(src.eval(xy + float2(-1.0, -1.0) * px));
  half tm = luma(src.eval(xy + float2( 0.0, -1.0) * px));
  half tr = luma(src.eval(xy + float2( 1.0, -1.0) * px));
  half ml = luma(src.eval(xy + float2(-1.0,  0.0) * px));
  half mr = luma(src.eval(xy + float2( 1.0,  0.0) * px));
  half bl = luma(src.eval(xy + float2(-1.0,  1.0) * px));
  half bm = luma(src.eval(xy + float2( 0.0,  1.0) * px));
  half br = luma(src.eval(xy + float2( 1.0,  1.0) * px));
  half gx = -tl - 2.0*ml - bl + tr + 2.0*mr + br;
  half gy = -tl - 2.0*tm - tr + bl + 2.0*bm + br;
  half mag = sqrt(gx*gx + gy*gy);
  half edge = smoothstep(half(threshold), half(threshold) * 1.8, mag);
  return ink * edge;
}
`;

// Sketch shader: grayscale + soft Sobel blend. Dark image areas and edges both
// contribute, producing a pencil-on-tracing-paper feel that sits between the
// full-color `anime` overlay and the sharp `edge` outline.
const SKSL_SKETCH = `
uniform shader src;
uniform float2 px;
uniform half4 ink;

half luma(half4 c) { return 0.299*c.r + 0.587*c.g + 0.114*c.b; }

half4 main(float2 xy) {
  half tl = luma(src.eval(xy + float2(-1.0, -1.0) * px));
  half tm = luma(src.eval(xy + float2( 0.0, -1.0) * px));
  half tr = luma(src.eval(xy + float2( 1.0, -1.0) * px));
  half ml = luma(src.eval(xy + float2(-1.0,  0.0) * px));
  half mm = luma(src.eval(xy));
  half mr = luma(src.eval(xy + float2( 1.0,  0.0) * px));
  half bl = luma(src.eval(xy + float2(-1.0,  1.0) * px));
  half bm = luma(src.eval(xy + float2( 0.0,  1.0) * px));
  half br = luma(src.eval(xy + float2( 1.0,  1.0) * px));
  half gx = -tl - 2.0*ml - bl + tr + 2.0*mr + br;
  half gy = -tl - 2.0*tm - tr + bl + 2.0*bm + br;
  half mag = sqrt(gx*gx + gy*gy);
  half edge = smoothstep(half(0.08), half(0.35), mag);
  half shade = clamp(1.0 - mm, half(0.0), half(1.0)) * 0.4;
  half darkness = clamp(edge * 0.9 + shade, half(0.0), half(0.85));
  return ink * darkness;
}
`;

let cachedEffect: SkRuntimeEffect | null = null;
function getSobelEffect(): SkRuntimeEffect {
  if (cachedEffect) return cachedEffect;
  const effect = Skia.RuntimeEffect.Make(SKSL);
  if (!effect) throw new Error('Failed to compile Sobel SKSL shader');
  cachedEffect = effect;
  return effect;
}

let cachedSketchEffect: SkRuntimeEffect | null = null;
function getSketchEffect(): SkRuntimeEffect {
  if (cachedSketchEffect) return cachedSketchEffect;
  const effect = Skia.RuntimeEffect.Make(SKSL_SKETCH);
  if (!effect) throw new Error('Failed to compile sketch SKSL shader');
  cachedSketchEffect = effect;
  return effect;
}

const renderCache = new Map<string, SkImage>();
const sketchCache = new Map<string, SkImage>();

// Memoised remote→local resolutions so repeated edge/sketch builds for the
// same scene don't re-download or re-probe the cache.
const localUriCache = new Map<string, string>();

// Skia's `Data.fromURI` remote fetch is unreliable for large CDN images, so we
// hand it a local `file://` path instead. `expo-image` already downloaded the
// same URL for the `anime` overlay, so reuse its disk cache first; only fall
// back to a direct download when that path isn't available. Last resort: the
// remote URL itself, so a build is attempted rather than failing outright.
async function resolveLocalUri(remoteUrl: string): Promise<string> {
  if (!/^https?:/i.test(remoteUrl)) return remoteUrl;

  const cached = localUriCache.get(remoteUrl);
  if (cached) return cached;

  try {
    await ExpoImage.prefetch(remoteUrl);
    const cachePath = await ExpoImage.getCachePathAsync(remoteUrl);
    if (cachePath) {
      const localUri = cachePath.startsWith('file://') ? cachePath : `file://${cachePath}`;
      localUriCache.set(remoteUrl, localUri);
      return localUri;
    }
  } catch {
    // Fall through to a direct download.
  }

  const cacheDir = FileSystem.cacheDirectory;
  if (cacheDir) {
    try {
      const ext = remoteUrl.split('?')[0].split('.').pop()?.toLowerCase();
      const safeExt = ext && ext.length <= 5 ? ext : 'img';
      const fileName = `edge-src-${hashString(remoteUrl)}.${safeExt}`;
      const dest = `${cacheDir}${fileName}`;
      const info = await FileSystem.getInfoAsync(dest);
      if (info.exists) {
        localUriCache.set(remoteUrl, dest);
        return dest;
      }
      const { uri } = await FileSystem.downloadAsync(remoteUrl, dest);
      localUriCache.set(remoteUrl, uri);
      return uri;
    } catch {
      // Fall through to the remote URL.
    }
  }

  return remoteUrl;
}

function hashString(input: string): string {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash << 5) - hash + input.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

function parseHexToRgb(hex: string): { r: number; g: number; b: number } {
  const cleaned = hex.replace('#', '').trim();
  const normalized =
    cleaned.length === 3
      ? cleaned
          .split('')
          .map((c) => c + c)
          .join('')
      : cleaned;
  if (normalized.length !== 6) {
    throw new Error(`Invalid hex color: ${hex}`);
  }
  const n = parseInt(normalized, 16);
  if (!Number.isFinite(n)) {
    throw new Error(`Invalid hex color: ${hex}`);
  }
  return {
    r: ((n >> 16) & 0xff) / 255,
    g: ((n >> 8) & 0xff) / 255,
    b: (n & 0xff) / 255,
  };
}

async function buildEdgeImage(
  uri: string,
  threshold: number,
  inkColor: string,
  inkOpacity: number
): Promise<SkImage> {
  const localUri = await resolveLocalUri(uri);
  const data = await Skia.Data.fromURI(localUri);
  if (!data) throw new Error('Failed to load image data');

  const image = Skia.Image.MakeImageFromEncoded(data);
  if (!image) throw new Error('Failed to decode image');

  const w = image.width();
  const h = image.height();
  if (!w || !h) throw new Error('Image has zero dimensions');

  const surface = Skia.Surface.Make(w, h);
  if (!surface) throw new Error('Failed to allocate Skia surface');

  const effect = getSobelEffect();
  const imageShader = image.makeShaderOptions(
    TileMode.Clamp,
    TileMode.Clamp,
    FilterMode.Linear,
    MipmapMode.None
  );

  const { r, g, b } = parseHexToRgb(inkColor);
  const a = Math.max(0, Math.min(1, inkOpacity));

  // Uniform layout must match the SKSL declaration order:
  // px (float2), threshold (float), ink (half4 = float4).
  const uniforms = [1 / w, 1 / h, threshold, r * a, g * a, b * a, a];
  const shader = effect.makeShaderWithChildren(uniforms, [imageShader]);

  const paint = Skia.Paint();
  paint.setShader(shader);

  const canvas = surface.getCanvas();
  canvas.drawRect({ x: 0, y: 0, width: w, height: h }, paint);

  const snapshot = surface.makeImageSnapshot();
  return snapshot;
}

export function useEdgeImage(
  uri: string | null | undefined,
  opts: EdgeImageOptions = {}
): EdgeImageState {
  const threshold = opts.threshold ?? DEFAULT_THRESHOLD;
  const inkColor = opts.inkColor ?? DEFAULT_INK_COLOR;
  const inkOpacity = opts.inkOpacity ?? DEFAULT_INK_OPACITY;

  const [edgeImage, setEdgeImage] = useState<SkImage | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!uri) {
      setEdgeImage(null);
      setLoading(false);
      setError(null);
      return;
    }

    const key = `${uri}|${threshold}|${inkColor}|${inkOpacity}`;
    const cached = renderCache.get(key);
    if (cached) {
      setEdgeImage(cached);
      setLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;
    setEdgeImage(null);
    setLoading(true);
    setError(null);

    buildEdgeImage(uri, threshold, inkColor, inkOpacity)
      .then((img) => {
        if (cancelled) return;
        renderCache.set(key, img);
        setEdgeImage(img);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const e = err instanceof Error ? err : new Error(String(err));
        setEdgeImage(null);
        setLoading(false);
        setError(e);
      });

    return () => {
      cancelled = true;
    };
  }, [uri, threshold, inkColor, inkOpacity]);

  return { edgeImage, loading, error };
}

async function buildSketchImage(
  uri: string,
  inkColor: string,
  inkOpacity: number
): Promise<SkImage> {
  const localUri = await resolveLocalUri(uri);
  const data = await Skia.Data.fromURI(localUri);
  if (!data) throw new Error('Failed to load image data');

  const image = Skia.Image.MakeImageFromEncoded(data);
  if (!image) throw new Error('Failed to decode image');

  const w = image.width();
  const h = image.height();
  if (!w || !h) throw new Error('Image has zero dimensions');

  const surface = Skia.Surface.Make(w, h);
  if (!surface) throw new Error('Failed to allocate Skia surface');

  const effect = getSketchEffect();
  const imageShader = image.makeShaderOptions(
    TileMode.Clamp,
    TileMode.Clamp,
    FilterMode.Linear,
    MipmapMode.None
  );

  const { r, g, b } = parseHexToRgb(inkColor);
  const a = Math.max(0, Math.min(1, inkOpacity));

  // Uniform order must match SKSL_SKETCH: px (float2), ink (half4).
  const uniforms = [1 / w, 1 / h, r * a, g * a, b * a, a];
  const shader = effect.makeShaderWithChildren(uniforms, [imageShader]);

  const paint = Skia.Paint();
  paint.setShader(shader);

  const canvas = surface.getCanvas();
  canvas.drawRect({ x: 0, y: 0, width: w, height: h }, paint);

  return surface.makeImageSnapshot();
}

export function useSketchImage(
  uri: string | null | undefined,
  opts: SketchImageOptions = {}
): SketchImageState {
  const inkColor = opts.inkColor ?? '#1A1A1A';
  const inkOpacity = opts.inkOpacity ?? 1;

  const [sketchImage, setSketchImage] = useState<SkImage | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!uri) {
      setSketchImage(null);
      setLoading(false);
      setError(null);
      return;
    }

    const key = `${uri}|${inkColor}|${inkOpacity}`;
    const cached = sketchCache.get(key);
    if (cached) {
      setSketchImage(cached);
      setLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;
    setSketchImage(null);
    setLoading(true);
    setError(null);

    buildSketchImage(uri, inkColor, inkOpacity)
      .then((img) => {
        if (cancelled) return;
        sketchCache.set(key, img);
        setSketchImage(img);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const e = err instanceof Error ? err : new Error(String(err));
        setSketchImage(null);
        setLoading(false);
        setError(e);
      });

    return () => {
      cancelled = true;
    };
  }, [uri, inkColor, inkOpacity]);

  return { sketchImage, loading, error };
}
