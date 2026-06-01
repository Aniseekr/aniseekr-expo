// Subject overlay (去背) for the pilgrimage compare camera.
//
// Replaces the old elliptical matte: instead of punching a soft ellipse out of
// the anime scene, we run the scene through the on-device subject lifter
// (Vision / ML Kit) and overlay the real silhouette cut-out. Both the live
// preview (this hook) and the capture compositor go through `resolveSceneCutout`
// so they agree on the exact same cut-out file.
//
// Honest fallback (CLAUDE.md rule 8): when the native lifter isn't installed yet
// or can't find a subject, we fall back to the FULL scene image (no fabricated
// matte, no ellipse) — `hasAlpha:false` tells callers it wasn't cut out.

import { Skia } from '@shopify/react-native-skia';
import type { SkImage } from '@shopify/react-native-skia';
import { useEffect, useState } from 'react';
import { subjectLifter } from '../companion/subject-lifter';
import { resolveLocalUri } from './edge-image-skia';

export interface SceneCutout {
  /** Local file uri to draw — the transparent cut-out, or the full scene. */
  uri: string;
  /** True only when a real background-removed cut-out was produced. */
  hasAlpha: boolean;
}

// url → resolved cutout (memoised so preview + capture share one lift, and a
// mode re-toggle doesn't re-run segmentation).
const cutoutCache = new Map<string, SceneCutout>();
const skImageCache = new Map<string, SkImage>();

/**
 * Lift the foreground subject out of a scene image. Resolves the (possibly
 * remote) url to a local file, runs the lifter, and caches the result. Falls
 * back to the full local image when segmentation is unavailable or finds
 * nothing — never invents a mask.
 */
export async function resolveSceneCutout(remoteUrl: string): Promise<SceneCutout> {
  const cached = cutoutCache.get(remoteUrl);
  if (cached) return cached;

  const localUri = await resolveLocalUri(remoteUrl);

  if (subjectLifter.isSupported()) {
    try {
      const lifted = await subjectLifter.lift(localUri);
      if (lifted.hasAlpha && lifted.uri) {
        const result: SceneCutout = { uri: lifted.uri, hasAlpha: true };
        cutoutCache.set(remoteUrl, result);
        return result;
      }
    } catch {
      // No subject / lift failed — fall through to the full image.
    }
  }

  const fallback: SceneCutout = { uri: localUri, hasAlpha: false };
  cutoutCache.set(remoteUrl, fallback);
  return fallback;
}

async function decodeSkImage(uri: string): Promise<SkImage> {
  const cached = skImageCache.get(uri);
  if (cached) return cached;
  const data = await Skia.Data.fromURI(uri);
  if (!data) throw new Error('Failed to load subject cut-out data');
  const image = Skia.Image.MakeImageFromEncoded(data);
  if (!image) throw new Error('Failed to decode subject cut-out');
  skImageCache.set(uri, image);
  return image;
}

export interface LiftedSubjectState {
  image: SkImage | null;
  loading: boolean;
  error: Error | null;
}

/**
 * Live-preview hook: lifts `url` and decodes the cut-out into an `SkImage` so
 * <OverlayLayer/> can render it through the same Skia path the edge/sketch
 * overlays use (transform + opacity for free). `null` url disables it.
 */
export function useLiftedSubjectImage(url: string | null | undefined): LiftedSubjectState {
  const [image, setImage] = useState<SkImage | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!url) {
      setImage(null);
      setLoading(false);
      setError(null);
      return;
    }
    let cancelled = false;
    setImage(null);
    setLoading(true);
    setError(null);

    resolveSceneCutout(url)
      .then((cutout) => decodeSkImage(cutout.uri))
      .then((img) => {
        if (cancelled) return;
        setImage(img);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setImage(null);
        setError(err instanceof Error ? err : new Error(String(err)));
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [url]);

  return { image, loading, error };
}
