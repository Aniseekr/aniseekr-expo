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
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { Image as RNImage, Platform, StyleSheet, View } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import {
  Gesture,
  GestureDetector,
  type PinchGesture,
  type TapGesture,
} from 'react-native-gesture-handler';
import {
  Camera,
  CommonResolutions,
  type CameraDevice,
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

  /**
   * Caller-supplied active CameraDevice. When provided (e.g. by the strategic
   * lens-switching hook), it OVERRIDES the internal `useResolvedCameraDevice`
   * pick — so the camera session opens on the lens the FSM chose
   * (`cohort.primary` or `cohort.ultraWide`). When omitted, behaviour falls
   * back to the legacy in-stage resolver path, preserving every existing
   * call site that hasn't migrated yet.
   *
   * SESSION LIFECYCLE: changing `device` mid-flight forces VisionCamera to
   * tear down the previous CameraX session and bring up a new one for the
   * new device (~200–400ms on Android). During that window `sessionStarted`
   * flips back to false, gating zoom/exposure/torch back to `undefined` and
   * preventing the OperationCanceledException race that would otherwise
   * fire on the dead controller.
   */
  device?: CameraDevice;

  /**
   * Optional file URI of a snapshot of the previous preview, captured by the
   * caller right before requesting a lens swap (via `engine.takeSnapshot()`).
   * When provided AND `showWarmup` is true, the snapshot is rendered as a
   * still image at full opacity ABOVE the (now-black) live preview and below
   * the vignette overlay — so the user never sees the CameraX swap blackout.
   * Crossfades out via Reanimated when `showWarmup` flips back to false.
   *
   * Android-only — VisionCamera v5's PreviewView.takeSnapshot is documented as
   * Android-only. On iOS this prop is always `null`; the snapshot path falls
   * through to the animated vignette alone, which is still much softer than
   * the old hard-cut overlay.
   */
  freezeFrameUri?: string | null;
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
    device: deviceProp,
    freezeFrameUri,
  },
  ref
) {
  const { theme } = useTheme();
  const cameraRef = useRef<CameraRef>(null);
  const enableShutterSoundRef = useRef(enableShutterSound);
  enableShutterSoundRef.current = enableShutterSound;

  // Device resolution: caller-supplied `deviceProp` wins (the strategic
  // lens-switching hook owns this end), with the legacy in-stage resolver
  // as fallback for screens that haven't migrated. The resolver still has
  // to run unconditionally even when deviceProp is provided — `useCameraDevices`
  // is a subscription that returns the same array reference and is otherwise
  // free to memoise. Cheap to call; the only real cost is `classifyCohort`-
  // adjacent picker math which is microsecond-scale.
  const fallbackDevice = useResolvedCameraDevice(facing);
  const device = deviceProp ?? fallbackDevice;
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
      // Real count from VisionCamera — `device.physicalDevices.length` mirrors
      // CameraX's `cameraInfo.physicalCameraInfos.size` on Android (which is
      // the *only* multi-cam signal the adapter doesn't stub out) and matches
      // `AVCaptureDevice.constituentDevices.count` on iOS.
      physicalDeviceCount: device.physicalDevices.length,
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

  // Stable ref to the active device's physical lens type for capture
  // metadata. We can't pass `device` straight to `takePhoto` because the
  // callback is memoised; instead, the ref reads the current value each
  // time a photo is captured. The lens type is derived from `device.type`
  // when it's a known physical lens; if it's `wide-angle` (or any unknown
  // value on Android where CameraX stubs the type field) we fall back to
  // `wide-angle` so the compare-screen analysis treats the capture as
  // baseline.
  const captureLensTypeRef = useRef<EnginePhysicalLensType | undefined>(undefined);
  captureLensTypeRef.current = device && isPhysicalLensType(device.type) ? device.type : undefined;

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
      return {
        uri,
        width: dimensions.width,
        height: dimensions.height,
        lensType: captureLensTypeRef.current,
      };
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

  // Grab a fast snapshot of the current preview surface and save it to the
  // app's cache directory so the screen can paint it as a freeze-frame
  // during the next lens-switch session swap. Resolves to the file URI on
  // success and to `null` on every failure mode (iOS — no API, missing ref,
  // PreviewView not ready, file save error). Callers MUST treat `null` as
  // "no overlay" — the animated vignette already covers that path.
  const takeSnapshot = useCallback(async (): Promise<string | null> => {
    // VisionCamera v5's PreviewView.takeSnapshot is documented as Android-only;
    // calling it on iOS throws synchronously. Short-circuit so the caller's
    // optional-chain (`takeSnapshot()?.then(...)`) never inflates the JS
    // microtask queue with an immediate rejection.
    if (Platform.OS !== 'android') return null;
    const camera = cameraRef.current;
    const preview = camera?.preview;
    if (!preview) return null;
    if (!FileSystem.cacheDirectory) return null;
    try {
      const image = await preview.takeSnapshot();
      const path = `${FileSystem.cacheDirectory}lens-switch-snapshot-${Date.now()}.jpg`;
      // 60 quality keeps the file under ~100 kB for a 1080p preview — fast
      // enough that the save finishes well before CameraX has finished
      // tearing down the old session.
      await image.saveToFileAsync(path, 'jpg', 60);
      return path.startsWith(FILE_SCHEME) ? path : `${FILE_SCHEME}${path.replace(/^file:\/+/, '/')}`;
    } catch (error) {
      console.warn('[CameraStage] takeSnapshot failed', error);
      return null;
    }
  }, []);

  useImperativeHandle(ref, () => ({ takePhoto, focus, getDeviceInfo, takeSnapshot }), [
    takePhoto,
    focus,
    getDeviceInfo,
    takeSnapshot,
  ]);

  // Selfie mirroring is a Camera prop in VisionCamera v5 (it mirrors the
  // *saved* output, not just the preview). 'auto' is VisionCamera's default
  // behaviour — we only deviate to 'off' when the user explicitly toggled
  // mirror off on the front camera.
  const mirrorMode: MirrorMode | undefined = useMemo(() => {
    if (facing !== 'front') return undefined;
    return mirrorSelfie === false ? 'off' : 'auto';
  }, [facing, mirrorSelfie]);

  // Torch / exposure / zoom props feed CameraX directly. Two gates protect
  // these from racing the underlying session:
  //
  //   1. `active=false` — the user has paused the session (sheet covers the
  //      preview, app backgrounded). VisionCamera's *Updater hooks call
  //      setZoom / setExposureBias / setTorchMode unconditionally on every
  //      re-render of the relevant prop, so we substitute `undefined` to
  //      make them early-return.
  //
  //   2. `sessionStarted=false` — the Camera view has mounted but the
  //      CameraX session hasn't yet reached its "active" state. The
  //      *Updater hooks fire on first mount with a defined `controller`,
  //      but CameraX takes ~100–500ms more before accepting operations.
  //      In that window every setZoom / setExposureBias / setTorchMode
  //      throws `androidx.camera.core.CameraControl$OperationCanceledException:
  //      Camera is not active` — an unhandled promise rejection that
  //      shows up in the dev red box even though the camera continues to
  //      come up cleanly. Holding the props at `undefined` until
  //      `onStarted` fires sidesteps the race; the SharedValues flow
  //      through on the next render and reach a controller that's truly
  //      ready.
  //
  // `sessionStarted` stays `true` across pauses (CameraX's
  // startRunning/stopRunning doesn't re-fire onStarted), so the gate only
  // bites during the cold-start window.
  const [sessionStarted, setSessionStarted] = useState(false);
  // When the active `device` changes (lens swap via the strategic FSM, or
  // facing flip), VisionCamera tears down the previous CameraX session and
  // brings up a new one for the new device. `sessionStarted` must reset to
  // `false` for the duration of that swap — otherwise zoom/exposure/torch
  // would re-fire against a freshly-dead controller before the new session
  // reports `onStarted`, throwing the same OperationCanceledException the
  // cold-start gate was added to suppress.
  const lastDeviceIdRef = useRef<string | undefined>(device?.id);
  useEffect(() => {
    if (device?.id !== lastDeviceIdRef.current) {
      lastDeviceIdRef.current = device?.id;
      setSessionStarted(false);
      // Clamp `zoomShared` to the NEW device's range BEFORE the next CameraX
      // setZoom fires. Without this, a wide-session zoomShared of 2.0 would
      // be passed to the freshly-mounted ultra-wide controller (maxZoom ≈ 1.0)
      // and CameraX throws `CameraControl$OperationCanceledException: zoom
      // out of range ...`. Clamping to `1.0` (= ultra-wide's native widest /
      // wide's native widest) also lands the dial indicator on the new
      // device's neutral position so it doesn't visually flicker.
      if (zoomShared && device) {
        const safeMin = Number.isFinite(device.minZoom) && device.minZoom > 0 ? device.minZoom : 1;
        const safeMax = Number.isFinite(device.maxZoom) && device.maxZoom > 0 ? device.maxZoom : 1;
        const current = zoomShared.value;
        const clamped = current < safeMin ? safeMin : current > safeMax ? safeMax : current;
        if (clamped !== current) {
          zoomShared.value = clamped;
        }
      }
    }
  }, [device, zoomShared]);
  const sessionReady = active && sessionStarted;
  const resolvedTorchMode: TorchMode | undefined = sessionReady
    ? enableTorch
      ? 'on'
      : 'off'
    : undefined;
  const resolvedExposure = sessionReady ? exposureShared : undefined;
  // `safeZoom` is `zoomShared` clamped to the active device's [minZoom, maxZoom]
  // window on the UI thread. The dial strip on standalone-switch cohorts can
  // legitimately write `zoomShared = 0.5` (the wide-equivalent value the user
  // is dragging toward) BEFORE the FSM has swapped to the ultra-wide session
  // — passing 0.5 straight to a wide-active CameraX controller would throw
  // `setZoom out of range`. The dial keeps its visual position via zoomShared;
  // the camera only ever sees the in-range clamp. Once the swap fires and
  // the new device's minZoom drops to 1.0 native (= 0.5 wide-equiv), the
  // clamp opens up and the camera follows naturally.
  const deviceMinZoom = device?.minZoom;
  const deviceMaxZoom = device?.maxZoom;
  const safeZoom = useDerivedValue(() => {
    const min =
      typeof deviceMinZoom === 'number' && deviceMinZoom > 0 && Number.isFinite(deviceMinZoom)
        ? deviceMinZoom
        : 1;
    const max =
      typeof deviceMaxZoom === 'number' && deviceMaxZoom > 0 && Number.isFinite(deviceMaxZoom)
        ? deviceMaxZoom
        : 1;
    const v = zoomShared.value;
    if (v < min) return min;
    if (v > max) return max;
    return v;
  }, [deviceMinZoom, deviceMaxZoom]);
  const resolvedZoom = sessionReady ? safeZoom : undefined;

  const handleStarted = useCallback(() => {
    setSessionStarted(true);
    onCameraReady?.();
  }, [onCameraReady]);

  const handleMountError = useCallback(
    (err: Error) => {
      onMountError?.({ nativeEvent: { message: err.message } });
    },
    [onMountError]
  );

  // Animated curtain that smoothly masks the CameraX session swap.
  // `overlayOpacity` drives the dark vignette; `pulseProgress` drives the
  // faint 1 Hz pulse that signals "something is happening" without the
  // judgmental spinner. `cameraScale` gives the preview a barely-perceptible
  // 1 → 0.985 → 1 squeeze so the transition feels intentional rather than
  // jolting. `freezeOpacity` crossfades the captured freeze-frame in over the
  // black preview surface (Android-only path; see `takeSnapshot`). All four
  // are SharedValues so React never re-renders during the animation — every
  // tween stays on the UI thread.
  const overlayOpacity = useSharedValue(0);
  const pulseProgress = useSharedValue(0);
  const cameraScale = useSharedValue(1);
  const freezeOpacity = useSharedValue(0);

  useEffect(() => {
    if (showWarmup) {
      // 80 ms delay swallows the cache-warm cases where the session is up
      // before the user could even see a flash. Past that, ease in over 220 ms
      // to ~75 % opacity — dark enough to mask the black preview surface
      // without going full black.
      overlayOpacity.value = withDelay(
        80,
        withTiming(0.75, { duration: 220, easing: Easing.out(Easing.cubic) })
      );
      // 1 Hz breathing pulse on a 0→1→0 cycle, repeated until the swap ends.
      pulseProgress.value = withRepeat(
        withSequence(
          withTiming(1, { duration: 700, easing: Easing.inOut(Easing.quad) }),
          withTiming(0, { duration: 700, easing: Easing.inOut(Easing.quad) })
        ),
        -1,
        false
      );
      // Squeeze the live preview by a hair so the eye reads the transition as
      // optical zoom motion rather than a freeze.
      cameraScale.value = withTiming(0.985, {
        duration: 260,
        easing: Easing.out(Easing.cubic),
      });
    } else {
      // Ease everything out together. 200 ms feels snappy without clipping.
      overlayOpacity.value = withTiming(0, {
        duration: 200,
        easing: Easing.out(Easing.cubic),
      });
      cancelAnimation(pulseProgress);
      pulseProgress.value = withTiming(0, { duration: 200 });
      cameraScale.value = withTiming(1, {
        duration: 260,
        easing: Easing.out(Easing.cubic),
      });
    }
    return () => {
      // Stop the repeat when unmounting / re-running so a torn-down session
      // doesn't leave the pulse animation churning the UI thread.
      cancelAnimation(pulseProgress);
    };
  }, [showWarmup, overlayOpacity, pulseProgress, cameraScale]);

  // Crossfade the freeze-frame snapshot. When `freezeFrameUri` lands AND the
  // warmup is active, fade it in at full opacity over the black preview.
  // When the new session reports ready (`showWarmup` flips false) OR the
  // caller clears the URI, fade back to 0.
  useEffect(() => {
    if (showWarmup && freezeFrameUri) {
      freezeOpacity.value = withTiming(1, {
        duration: 140,
        easing: Easing.out(Easing.cubic),
      });
    } else {
      freezeOpacity.value = withTiming(0, {
        duration: 240,
        easing: Easing.out(Easing.cubic),
      });
    }
  }, [showWarmup, freezeFrameUri, freezeOpacity]);

  const cameraAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: cameraScale.value }],
  }));
  const overlayAnimatedStyle = useAnimatedStyle(() => ({
    opacity: overlayOpacity.value,
  }));
  // Faint center pulse that breathes in and out. Lifts opacity from 0.15→0.32
  // with a tiny scale change so the eye reads it as a heartbeat, not a spinner.
  const pulseAnimatedStyle = useAnimatedStyle(() => ({
    opacity: 0.15 + 0.17 * pulseProgress.value,
    transform: [{ scale: 0.92 + 0.18 * pulseProgress.value }],
  }));
  const freezeAnimatedStyle = useAnimatedStyle(() => ({
    opacity: freezeOpacity.value,
  }));

  return (
    <View style={styles.root}>
      <GestureDetector gesture={Gesture.Simultaneous(pinchGesture, tapGesture)}>
        <View style={StyleSheet.absoluteFill}>
          {device ? (
            <Animated.View style={[StyleSheet.absoluteFill, cameraAnimatedStyle]}>
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
                onStarted={handleStarted}
                onError={handleMountError}
              />
            </Animated.View>
          ) : null}
          {/* Android-only freeze-frame. Painted ABOVE the live preview (which
              has gone black during the CameraX swap) and BELOW the vignette
              overlay, so the user sees the previous lens's framing held still
              instead of a jarring black flash. iOS skips this layer because
              VisionCamera's PreviewView.takeSnapshot is Android-only. */}
          {freezeFrameUri ? (
            <Animated.View
              pointerEvents="none"
              style={[StyleSheet.absoluteFill, freezeAnimatedStyle]}>
              <RNImage
                source={{ uri: freezeFrameUri }}
                style={StyleSheet.absoluteFill}
                resizeMode="cover"
                fadeDuration={0}
              />
            </Animated.View>
          ) : null}
          <Animated.View
            pointerEvents="none"
            style={[StyleSheet.absoluteFill, styles.warmup, overlayAnimatedStyle]}>
            {/* Radial-ish vignette painted with two stacked linear gradients
                — dark at the edges, transparent in the middle. Reads as a soft
                "moment of focus" instead of a flat tint. */}
            <LinearGradient
              pointerEvents="none"
              colors={['rgba(0,0,0,0.55)', 'rgba(0,0,0,0)', 'rgba(0,0,0,0.55)']}
              locations={[0, 0.5, 1]}
              start={{ x: 0.5, y: 0 }}
              end={{ x: 0.5, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
            <LinearGradient
              pointerEvents="none"
              colors={['rgba(0,0,0,0.45)', 'rgba(0,0,0,0)', 'rgba(0,0,0,0.45)']}
              locations={[0, 0.5, 1]}
              start={{ x: 0, y: 0.5 }}
              end={{ x: 1, y: 0.5 }}
              style={StyleSheet.absoluteFill}
            />
            {/* Faint accent pulse at the center. Uses theme.accent so brand
                identity carries through even during the transition. */}
            <Animated.View style={[styles.pulseDot, { backgroundColor: theme.accent }, pulseAnimatedStyle]} />
          </Animated.View>
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
  pulseDot: {
    width: 56,
    height: 56,
    borderRadius: 28,
  },
});
