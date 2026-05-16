import type { CameraView } from 'expo-camera';
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { Platform } from 'react-native';
import {
  sanitizeAndroidCameraCapabilities,
  type AndroidCameraCapabilities,
} from '../libs/services/pilgrimage/native-camera';

type NativeCameraViewRef = {
  getNativeCameraCapabilities?: () => Promise<unknown>;
};

type CameraViewWithNativeRef = CameraView & {
  _cameraRef?: { current?: NativeCameraViewRef | null };
};

export async function getAndroidCameraNativeCapabilities(
  camera: CameraView | null
): Promise<AndroidCameraCapabilities | null> {
  if (Platform.OS !== 'android' || !camera) return null;
  const nativeRef = (camera as CameraViewWithNativeRef)._cameraRef?.current;
  if (!nativeRef?.getNativeCameraCapabilities) return null;
  try {
    const raw = await nativeRef.getNativeCameraCapabilities();
    return sanitizeAndroidCameraCapabilities(raw);
  } catch {
    return null;
  }
}

export interface UseAndroidCameraNativeCapabilitiesInput {
  cameraRef: RefObject<CameraView | null>;
}

export interface UseAndroidCameraNativeCapabilitiesOutput {
  capabilities: AndroidCameraCapabilities | null;
  refresh: () => Promise<void>;
}

export function useAndroidCameraNativeCapabilities({
  cameraRef,
}: UseAndroidCameraNativeCapabilitiesInput): UseAndroidCameraNativeCapabilitiesOutput {
  const [capabilities, setCapabilities] = useState<AndroidCameraCapabilities | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    const next = await getAndroidCameraNativeCapabilities(cameraRef.current);
    if (mountedRef.current) setCapabilities(next);
  }, [cameraRef]);

  return { capabilities, refresh };
}
