import type { SkImage } from '@shopify/react-native-skia';
import {
  useEdgeImage,
  useSketchImage,
} from '../libs/services/pilgrimage/edge-image-skia';
import type { OverlayMode } from '../components/pilgrimage/camera/types';

interface UseEdgeOrSketchInput {
  mode: OverlayMode;
  hiResImageUrl: string;
  themeColor: string;
}

interface UseEdgeOrSketchOutput {
  image: SkImage | null;
  loading: boolean;
  error: Error | null;
}

export function useEdgeOrSketch({
  mode,
  hiResImageUrl,
  themeColor,
}: UseEdgeOrSketchInput): UseEdgeOrSketchOutput {
  const {
    edgeImage,
    loading: edgeLoading,
    error: edgeError,
  } = useEdgeImage(mode === 'edge' ? hiResImageUrl : null, {
    inkColor: themeColor,
    inkOpacity: 1,
  });
  const {
    sketchImage,
    loading: sketchLoading,
    error: sketchError,
  } = useSketchImage(mode === 'sketch' ? hiResImageUrl : null, {
    inkColor: '#1A1A1A',
    inkOpacity: 1,
  });

  if (mode === 'edge') {
    return { image: edgeImage, loading: edgeLoading, error: edgeError };
  }
  if (mode === 'sketch') {
    return { image: sketchImage, loading: sketchLoading, error: sketchError };
  }
  return { image: null, loading: false, error: null };
}
