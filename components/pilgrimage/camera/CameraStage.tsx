// Live camera surface. This is the single file that imports
// react-native-vision-camera — everything else in the app talks to the
// `CameraEngineHandle` interface (see ../camera-engine.ts).
//
// Responsibilities:
//  - Resolve the physical device + photo output.
//  - Forward UI-thread zoom and exposure SharedValues to the native props.
//  - Wire HDR through a `PhotoHDRConstraint` when capture mode requests it.
//  - Drive the selfie mirror via `mirrorMode` (VisionCamera mirrors the
//    saved photo, not just the preview).
//  - Adapt the tap-gesture into a real `focusTo()` metering call.
//  - Expose `takePhoto`, `focus`, and `getDeviceInfo` to the screen via an
//    imperative handle.
//
// The parent (`compare/[spotId].tsx`) keeps doing its own composition of
// onCameraReady / lens-info refresh / picture-size probing.
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import type { SharedValue } from 'react-native-reanimated';
import {
  Gesture,
  GestureDetector,
  type PinchGesture,
  type TapGesture,
} from 'react-native-gesture-handler';
import {
  Camera,
  CommonResolutions,
  type CameraFrameOutput,
  type CameraRef,
  type Constraint,
  type DeviceType,
  type MirrorMode,
  type QualityPrioritization,
  type TorchMode,
  usePhotoOutput,
} from 'react-native-vision-camera';
import { useTheme } from '../../../context/ThemeContext';
import { resolveCapturedPhotoDimensions } from '../../../libs/services/pilgrimage/camera-engine-parity';
import { useResolvedCameraDevice } from '../../../hooks/useResolvedCameraDevice';
import { ThemedText } from '../../themed';
import type {
  CameraDeviceInfo,
  CameraEngineHandle,
  EnginePhoto,
  EnginePhysicalLensType,
} from './camera-engine';
import type { AspectRatio, CameraFacing } from './types';

const FILE_SCHEME = 'file://';

type ResolutionTier = '4k' | '2k';

const PHYSICAL_LENS_TYPES: ReadonlySet<EnginePhysicalLensType> = new Set([
  'ultra-wide-angle',
  'wide-angle',
  'telephoto',
]);

function isPhysicalLensType(value: DeviceType): value is EnginePhysicalLensType {
  return PHYSICAL_LENS_TYPES.has(value as EnginePhysicalLensType);
}

// VisionCamera reports the photo path without a scheme. The rest of the app
// (Skia decode, expo-file-system, expo-image) expects a `file://` URI.
function pathToFileUri(path: string): string {
  if (path.startsWith(FILE_SCHEME) || path.startsWith('http')) return path;
  return path.startsWith('/') ? `${FILE_SCHEME}${path}` : `${FILE_SCHEME}/${path}`;
}

function resolveTargetResolution(tier: ResolutionTier, aspect: AspectRatio) {
  if (tier === '2k') {
    return aspect === '16:9' ? CommonResolutions.QHD_16_9 : CommonResolutions.QHD_4_3;
  }
  return aspect === '16:9' ? CommonResolutions.UHD_16_9 : CommonResolutions.UHD_4_3;
}

export interface CameraStageProps {
  facing: CameraFacing;
  /** Real zoom factor units (e.g. 1, 2, 3 — bounded by device.minZoom..maxZoom). */
  zoomShared: SharedValue<number>;
  /** Real EV bias. Bounded by device.minExposureBias..maxExposureBias. */
  exposureShared: SharedValue<number>;
  /** When true, the live preview drives an HDR-enabled session via the PhotoHDR constraint. */
  preferHdr?: boolean;
  enableTorch: boolean;
  /** Mirror the saved selfie when on. Front-only; ignored on the back camera. */
  mirrorSelfie?: boolean;
  active?: boolean;
  resolutionTier: ResolutionTier;
  aspect: AspectRatio;
  qualityPrioritization: QualityPrioritization;
  quality: number;
  /** Whether the next capture should fire the system shutter sound. Defaults to true. */
  enableShutterSound?: boolean;

  pinchGesture: PinchGesture;
  tapGesture: TapGesture;

  /** Fired when the underlying session first starts streaming preview frames. */
  onCameraReady?: () => void;
  /** Native session error (recoverable or fatal). */
  onMountError?: (e: { nativeEvent: { message: string } }) => void;
  /** Pushed whenever device caps are (re)resolved — typically once per device pick. */
  onDeviceInfo?: (info: CameraDeviceInfo | null) => void;

  /** Paint a translucent overlay + spinner while the session warms up. */
  showWarmup?: boolean;

  /**
   * Optional CameraFrameOutput produced by `useFrameOutput` (e.g. the auto-mode
   * scene analyzer). When provided, the underlying VisionCamera session adds
   * a frame-streaming output alongside the photo output. When undefined, no
   * frame processor is attached and the session runs with photo-only outputs.
   */
  frameOutput?: CameraFrameOutput;
}

export const CameraStage = forwardRef<CameraEngineHandle, CameraStageProps>(function CameraStage(
  {
    facing,
    zoomShared,
    exposureShared,
    preferHdr,
    enableTorch,
    mirrorSelfie,
    active = true,
    resolutionTier,
    aspect,
    qualityPrioritization,
    quality,
    enableShutterSound = true,
    pinchGesture,
    tapGesture,
    onCameraReady,
    onMountError,
    onDeviceInfo,
    showWarmup,
    frameOutput,
  },
  ref
) {
  const { theme } = useTheme();
  const cameraRef = useRef<CameraRef>(null);
  const enableShutterSoundRef = useRef(enableShutterSound);
  enableShutterSoundRef.current = enableShutterSound;

  // Device resolution lives in `useResolvedCameraDevice` because Android's
  // VisionCamera picker scores by a broken `type` field and would drop the
  // ultra-wide multi-cam in favour of a single-lens wide. The resolver
  // routes Android back-camera selection through `selectAndroidBackDevice`,
  // which scores by the CameraX values that actually work (minZoom,
  // isVirtualDevice, physical-child focalLength), and lets iOS / front
  // selection fall straight through to the stock VisionCamera filter.
  const device = useResolvedCameraDevice(facing);
  const targetResolution = useMemo(
    () => resolveTargetResolution(resolutionTier, aspect),
    [resolutionTier, aspect]
  );
  const photoOutput = usePhotoOutput({
    targetResolution,
    containerFormat: 'jpeg',
    quality,
    qualityPrioritization,
  });
  // When the auto-mode scene analyzer is active, its CameraFrameOutput rides
  // alongside the photo output so the session streams preview frames to the
  // worklet. The frame output is dropped from the list when undefined to avoid
  // spinning up an unused frame-processing thread.
  const outputs = useMemo(
    () => (frameOutput ? [photoOutput, frameOutput] : [photoOutput]),
    [photoOutput, frameOutput]
  );
  const constraints = useMemo<Constraint[]>(
    () => (preferHdr ? [{ photoHDR: true }] : []),
    [preferHdr]
  );

  // Compute the engine-shaped device info, derived directly from VisionCamera's
  // CameraDevice. Re-fires `onDeviceInfo` whenever the device swaps (e.g.
  // front/back flip) or its caps change.
  const deviceInfo = useMemo<CameraDeviceInfo | null>(() => {
    if (!device) return null;
    const physicalLensTypes: EnginePhysicalLensType[] = [];
    if (isPhysicalLensType(device.type)) physicalLensTypes.push(device.type);
    const physicalFocalLengths: number[] = [];
    for (const child of device.physicalDevices) {
      if (isPhysicalLensType(child.type) && !physicalLensTypes.includes(child.type)) {
        physicalLensTypes.push(child.type);
      }
      if (typeof child.focalLength === 'number' && Number.isFinite(child.focalLength) && child.focalLength > 0) {
        physicalFocalLengths.push(child.focalLength);
      }
    }
    physicalFocalLengths.sort((a, b) => a - b);
    return {
      minZoom: device.minZoom,
      maxZoom: device.maxZoom,
      neutralZoom: 1,
      physicalLensTypes,
      zoomLensSwitchFactors: [...device.zoomLensSwitchFactors],
      physicalFocalLengths,
      supportsPhotoHdr: device.supportsPhotoHDR,
      minExposureBias: device.minExposureBias,
      maxExposureBias: device.maxExposureBias,
      supportsFocusMetering: device.supportsFocusMetering,
      hasFlash: device.hasFlash,
      hasTorch: device.hasTorch,
    };
  }, [device]);

  const deviceInfoRef = useRef<CameraDeviceInfo | null>(deviceInfo);
  deviceInfoRef.current = deviceInfo;

  useEffect(() => {
    onDeviceInfo?.(deviceInfo);
  }, [deviceInfo, onDeviceInfo]);

  const takePhoto = useCallback(
    async (opts?: {
      flashMode?: 'on' | 'off' | 'auto';
      enableShutterSound?: boolean;
    }): Promise<EnginePhoto | null> => {
      const camera = cameraRef.current;
      if (!camera) return null;
      // photoOutput is the live ref-stable output owned by this stage; it's
      // safe to call directly because Camera is mounted with it.
      const file = await photoOutput.capturePhotoToFile(
        {
          flashMode: opts?.flashMode ?? 'off',
          enableShutterSound: opts?.enableShutterSound ?? enableShutterSoundRef.current,
        },
        {}
      );
      const uri = pathToFileUri(file.filePath);
      // VisionCamera's PhotoFile only carries the path. Decode the written file
      // once so preview, subject-composite, burst, and HDR records carry the real
      // pixel dimensions instead of the requested target resolution.
      const dimensions = await resolveCapturedPhotoDimensions(uri, targetResolution);
      return { uri, width: dimensions.width, height: dimensions.height };
    },
    [photoOutput, targetResolution]
  );

  const focus = useCallback(async (point: { x: number; y: number }) => {
    const camera = cameraRef.current;
    if (!camera) return;
    const info = deviceInfoRef.current;
    if (info && !info.supportsFocusMetering) return;
    try {
      // `responsiveness: 'snappy'` is recommended while taking photos.
      // The default 5s auto-reset matches our previous lock-timeout UX.
      await camera.focusTo({ x: point.x, y: point.y }, { responsiveness: 'snappy' });
    } catch (error) {
      // Focus may throw if the camera was reconfigured mid-flight; swallow so
      // a stale tap doesn't bubble up to the screen.
      console.warn('[CameraStage] focus failed', error);
    }
  }, []);

  const getDeviceInfo = useCallback(() => deviceInfoRef.current, []);

  useImperativeHandle(ref, () => ({ takePhoto, focus, getDeviceInfo }), [
    takePhoto,
    focus,
    getDeviceInfo,
  ]);

  // Selfie mirroring is a Camera prop in VisionCamera v5 (it mirrors the
  // *saved* output, not just the preview). 'auto' is VisionCamera's default
  // behaviour — we only deviate to 'off' when the user explicitly toggled
  // mirror off on the front camera.
  const mirrorMode: MirrorMode | undefined = useMemo(() => {
    if (facing !== 'front') return undefined;
    return mirrorSelfie === false ? 'off' : 'auto';
  }, [facing, mirrorSelfie]);

  // Torch / exposure / zoom props feed CameraX directly. When the session is
  // stopped (`active=false`), CameraX rejects `enableTorch()`,
  // `setExposureBias()`, and `setZoom()` with "Camera is not active" and
  // VisionCamera surfaces that as an unhandled JS promise rejection.
  //
  // The fix is to pass `undefined` for these props while the session is
  // paused so VisionCamera's *Updater hooks early-return without ever
  // touching the dormant controller. VisionCamera also runs its own
  // `useCameraSessionIsRunning` effect first (declared before the
  // *Updater hooks in `Camera.tsx`), so the session stop completes before
  // these effects re-evaluate — meaning the "undefined → no-op" branch is
  // what actually runs, not a stale "set value" call.
  //
  // When `active` flips back to true the SharedValues / TorchMode flow
  // through again on the next render and the Updater hooks call
  // setTorchMode / setExposureBias / setZoom against the freshly running
  // session. No reset gymnastics required: the SharedValues retain their
  // current values across the pause.
  const resolvedTorchMode: TorchMode | undefined = active
    ? enableTorch
      ? 'on'
      : 'off'
    : undefined;
  const resolvedExposure = active ? exposureShared : undefined;
  const resolvedZoom = active ? zoomShared : undefined;

  const handleMountError = useCallback(
    (err: Error) => {
      onMountError?.({ nativeEvent: { message: err.message } });
    },
    [onMountError]
  );

  return (
    <View style={styles.root}>
      <GestureDetector gesture={Gesture.Simultaneous(pinchGesture, tapGesture)}>
        <View style={StyleSheet.absoluteFill}>
          {device ? (
            <Camera
              ref={cameraRef}
              style={StyleSheet.absoluteFill}
              device={device}
              outputs={outputs}
              isActive={active}
              zoom={resolvedZoom}
              exposure={resolvedExposure}
              torchMode={resolvedTorchMode}
              mirrorMode={mirrorMode}
              constraints={constraints}
              orientationSource="interface"
              onStarted={onCameraReady}
              onError={handleMountError}
            />
          ) : null}
          {showWarmup ? (
            <View
              pointerEvents="none"
              style={[
                StyleSheet.absoluteFill,
                styles.warmup,
                { backgroundColor: theme.background.primary, opacity: 0.5 },
              ]}>
              <View style={styles.warmupInner}>
                <ActivityIndicator color={theme.accent} />
                <ThemedText variant="bodyMedium" tone="secondary" style={styles.warmupLabel}>
                  Preparing camera…
                </ThemedText>
              </View>
            </View>
          ) : null}
        </View>
      </GestureDetector>
    </View>
  );
});

export default CameraStage;

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  warmup: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  warmupInner: {
    alignItems: 'center',
    gap: 8,
  },
  warmupLabel: {
    textAlign: 'center',
  },
});
