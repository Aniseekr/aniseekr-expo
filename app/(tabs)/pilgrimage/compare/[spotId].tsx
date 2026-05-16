import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AppState,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { CameraView, useCameraPermissions, type CameraType } from 'expo-camera';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as ScreenOrientation from 'expo-screen-orientation';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { bottomPad } from '../../../../constants/DesignSystem';
import { useTheme } from '../../../../context/ThemeContext';
import { hapticsBridge } from '../../../../modules/haptics/hapticsBridge';
import { ThemedText, readableTextOn } from '../../../../components/themed';
import { toFullResImageUrl } from '../../../../libs/services/pilgrimage/anitabi-image';
import type { EdgeIntensity } from '../../../../libs/services/pilgrimage/edge-overlay';
import type { SubjectFocus } from '../../../../libs/services/pilgrimage/subject-overlay';
import { compositeSubjectIntoPhoto } from '../../../../libs/services/pilgrimage/subject-composite';
import { shouldCompositeSubjectOverlay } from '../../../../libs/services/pilgrimage/subject-composite-plan';
import { applyBrightnessToImage } from '../../../../libs/services/pilgrimage/apply-brightness';
import { buildAdditionalExif } from '../../../../libs/services/pilgrimage/build-exif-metadata';
import { pilgrimageRepository } from '../../../../libs/services/pilgrimage/pilgrimage-repository';
import { getPilgrimageSpotTitles } from '../../../../libs/services/pilgrimage/pilgrimage-localization';
import type { AnitabiPoint } from '../../../../libs/services/pilgrimage/types';
import {
  cameraOrientationLockIntent,
  CAMERA_BOTTOM_BAR_CONTENT_HEIGHT,
  CAMERA_SIDE_RAIL_WIDTH,
  resolveCameraBottomInset,
  resolveCameraToolMenuAnchor,
  resolveCameraActive,
  resolveTransientCameraHudVisibility,
  type CameraOrientationMode,
} from '../../../../libs/services/pilgrimage/camera-ui';
import {
  mergeCaptureExif,
  resolveCapturedUri,
} from '../../../../libs/services/pilgrimage/camera-capture';
import {
  pickAutoVirtualLens,
  stopForLens,
} from '../../../../libs/services/pilgrimage/lens-switching';
import {
  androidCameraExtensionModeForCapture,
  androidNativeStopsForCapabilities,
  androidStopZoomMap,
  shouldUseAndroidNativeHdr,
  zoomRatioForZoomValue,
} from '../../../../libs/services/pilgrimage/native-camera';
import CameraErrorBoundary from '../../../../components/pilgrimage/camera/CameraErrorBoundary';
import CameraStage from '../../../../components/pilgrimage/camera/CameraStage';
import OverlayLayer from '../../../../components/pilgrimage/camera/OverlayLayer';
import { FocusReticle } from '../../../../components/pilgrimage/camera/FocusReticle';
import { LevelHorizon } from '../../../../components/pilgrimage/camera/LevelHorizon';
import FocusExposureBar from '../../../../components/pilgrimage/camera/FocusExposureBar';
import CameraTopBar, {
  CameraHeaderButton,
} from '../../../../components/pilgrimage/camera/CameraTopBar';
import AlignmentHUD from '../../../../components/pilgrimage/camera/AlignmentHUD';
import ZoomDial from '../../../../components/pilgrimage/camera/ZoomDial';
import CameraToolMenu, {
  type CameraTool,
} from '../../../../components/pilgrimage/camera/CameraToolMenu';
import ShutterRow, {
  SHUTTER_ROW_LANDSCAPE_WIDTH,
} from '../../../../components/pilgrimage/camera/ShutterRow';
import OverlayControls from '../../../../components/pilgrimage/camera/chips/OverlayControls';
import ExposureControls from '../../../../components/pilgrimage/camera/chips/ExposureControls';
import AspectChip from '../../../../components/pilgrimage/camera/chips/AspectChip';
import CountdownChip from '../../../../components/pilgrimage/camera/chips/CountdownChip';
import OrientationChip from '../../../../components/pilgrimage/camera/chips/OrientationChip';
import CameraSettingsSheet from '../../../../components/pilgrimage/camera/CameraSettingsSheet';
import { CountdownOverlay } from '../../../../components/pilgrimage/camera/CountdownOverlay';
import type {
  AspectRatio,
  FlashMode,
  FocalStop,
  OverlayMode,
} from '../../../../components/pilgrimage/camera/types';
import { useCameraZoom, STOP_TO_ZOOM } from '../../../../hooks/useCameraZoom';
import { useTapToFocus } from '../../../../hooks/useTapToFocus';
import { useLensSwitcher } from '../../../../hooks/useLensSwitcher';
import { useBrightnessPreview } from '../../../../hooks/useBrightnessPreview';
import { useOverlayTransform } from '../../../../hooks/useOverlayTransform';
import { useAlignmentSensors } from '../../../../hooks/useAlignmentSensors';
import { useEdgeOrSketch } from '../../../../hooks/useEdgeOrSketch';
import {
  useCameraSettings,
  qualityToNumber,
  resolvePictureSize,
  type CaptureMode,
} from '../../../../hooks/useCameraSettings';
import { useCameraLifecycle } from '../../../../hooks/useCameraLifecycle';
import { useBurstCapture } from '../../../../hooks/useBurstCapture';
import { useCaptureCountdown } from '../../../../hooks/useCaptureCountdown';
import { usePseudoHDR } from '../../../../hooks/usePseudoHDR';
import { useAutoCapture } from '../../../../hooks/useAutoCapture';
import { useCaptureSession } from '../../../../hooks/useCaptureSession';
import { useAndroidCameraNativeCapabilities } from '../../../../hooks/useAndroidCameraNativeCapabilities';
import {
  getShots as getCaptureSessionShots,
  type CaptureSessionShot,
} from '../../../../libs/services/pilgrimage/capture-session';
import AutoCaptureStatusBadge from '../../../../components/pilgrimage/camera/AutoCaptureBadge';
import CaptureHistoryStrip from '../../../../components/pilgrimage/camera/CaptureHistoryStrip';
import SceneSwitcherSheet from '../../../../components/pilgrimage/camera/SceneSwitcherSheet';
import CaptureModeToast, {
  type CaptureModeToastValue,
} from '../../../../components/pilgrimage/camera/CaptureModeToast';
import OverlayOpacityToast, {
  type OverlayOpacityToastValue,
} from '../../../../components/pilgrimage/camera/OverlayOpacityToast';
import AutoCaptureToast, {
  type AutoCaptureToastValue,
} from '../../../../components/pilgrimage/camera/AutoCaptureToast';

type CameraRouteParams = {
  spotId: string;
  imageUrl: string;
  name: string;
  ep: string;
  animeId: string;
  animeTitle: string;
  themeColor: string;
  spotLat: string;
  spotLng: string;
};

// Flash lives as a top-bar icon button. The icon mirrors the live mode; the
// cycle drops `torch` on the front camera, which has no torch.
const FLASH_ICON: Record<FlashMode, keyof typeof Ionicons.glyphMap> = {
  off: 'flash-off-outline',
  auto: 'flash-outline',
  on: 'flash',
  torch: 'flashlight',
};
const FLASH_REAR_CYCLE: FlashMode[] = ['off', 'auto', 'on', 'torch'];
const FLASH_FRONT_CYCLE: FlashMode[] = ['off', 'auto', 'on'];

// Capture mode is a top-bar icon button that cycles single → burst → hdr; the
// icon mirrors the live mode and a toast explains each mode on change.
const CAPTURE_MODE_ICON: Record<CaptureMode, keyof typeof Ionicons.glyphMap> = {
  single: 'camera-outline',
  burst: 'albums-outline',
  hdr: 'contrast-outline',
};
const CAPTURE_MODE_CYCLE: CaptureMode[] = ['single', 'burst', 'hdr'];

// Overlay opacity has a quick-cycle top-bar button so the user can adjust the
// blend without the tool popover covering the preview. Five evenly-spread
// levels matching the slider's useful range.
const OVERLAY_OPACITY_CYCLE = [0.2, 0.35, 0.5, 0.7, 0.9];

export default function CompareCaptureScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const params = useLocalSearchParams<CameraRouteParams>();
  const { spotId = '', imageUrl = '', name = 'Scene', ep, animeId, animeTitle = '' } = params;
  const themeColor = params.themeColor || theme.accent;
  // Anitabi `?plan=h160` is a 284×160 thumb; upgrade to full 1920×1080 for the
  // overlay + Skia edge/sketch source.
  const hiResImageUrl = useMemo(() => toFullResImageUrl(imageUrl), [imageUrl]);

  const { width: winW, height: winH } = useWindowDimensions();
  const isLandscape = winW > winH;
  const cameraRef = useRef<CameraView | null>(null);
  const [permission, requestPermission] = useCameraPermissions();

  const [facing, setFacing] = useState<CameraType>('back');
  const [flashMode, setFlashMode] = useState<FlashMode>('off');
  const [aspect, setAspect] = useState<AspectRatio>('16:9');
  const [overlayMode, setOverlayMode] = useState<OverlayMode>('anime');
  const [edgeIntensity, setEdgeIntensity] = useState<EdgeIntensity>('low');
  const [subjectFocus, setSubjectFocus] = useState<SubjectFocus>('normal');
  const [subjectCombine, setSubjectCombine] = useState(false);
  const [overlayOpacity, setOverlayOpacity] = useState(0.35);
  const [editMode, setEditMode] = useState(false);
  const [evValue, setEvValue] = useState(0);
  const [orientationMode, setOrientationMode] = useState<CameraOrientationMode>('auto');
  const [capturing, setCapturing] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [activeTool, setActiveTool] = useState<CameraTool | null>(null);
  // `null` until the first capture-mode change — a fresh value re-fires the toast.
  const [captureModeToast, setCaptureModeToast] = useState<CaptureModeToastValue | null>(null);
  // `null` until the first opacity cycle — a fresh value re-fires the toast.
  const [overlayOpacityToast, setOverlayOpacityToast] = useState<OverlayOpacityToastValue | null>(
    null
  );
  // `null` until the first auto-capture — a fresh value re-fires the toast.
  const [autoCaptureToast, setAutoCaptureToast] = useState<AutoCaptureToastValue | null>(null);
  const [appIsForeground, setAppIsForeground] = useState(() => AppState.currentState === 'active');
  const [availablePictureSizes, setAvailablePictureSizes] = useState<string[]>([]);
  const [sceneSwitcherOpen, setSceneSwitcherOpen] = useState(false);
  // null = not yet fetched. Empty array = fetch ran but returned nothing.
  const [availableSpots, setAvailableSpots] = useState<readonly AnitabiPoint[] | null>(null);
  const [spotsLoading, setSpotsLoading] = useState(false);

  const { settings, setSettings } = useCameraSettings();
  const lifecycle = useCameraLifecycle(true);
  const { capabilities: androidNativeCapabilities, refresh: refreshAndroidNativeCapabilities } =
    useAndroidCameraNativeCapabilities({ cameraRef });
  const androidNativeStops = useMemo(
    () => androidNativeStopsForCapabilities(androidNativeCapabilities),
    [androidNativeCapabilities]
  );
  const androidNativeStopZoom = useMemo(
    () => androidStopZoomMap(androidNativeCapabilities),
    [androidNativeCapabilities]
  );
  const useAndroidNativeZoom =
    Platform.OS === 'android' && facing === 'back' && androidNativeCapabilities !== null;

  const zoom = useCameraZoom({
    initial: 1,
    stops: useAndroidNativeZoom ? androidNativeStops : undefined,
    stopZoom: useAndroidNativeZoom ? androidNativeStopZoom : undefined,
  });
  const tapFocus = useTapToFocus({ lockTimeoutMs: 5000 });
  const lensSwitcher = useLensSwitcher({ cameraRef });
  const {
    availableLenses,
    availableStops,
    selectedLens,
    setStop: setOpticalStop,
    hasOpticalZoom,
    refreshAvailableLenses,
    virtualLenses,
    setVirtualLens,
    isVirtualLensActive,
  } = lensSwitcher;
  const {
    active: cameraActive,
    isReady: cameraIsReady,
    onCameraReady,
    onMountError,
    setActive: setCameraActive,
    reset: resetCameraLifecycle,
  } = lifecycle;
  const brightness = useBrightnessPreview({ value: evValue });
  const overlayTransform = useOverlayTransform({ enabled: editMode });
  const getOverlayTransformSnapshot = overlayTransform.getSnapshot;
  const sensors = useAlignmentSensors({ spotLat: params.spotLat, spotLng: params.spotLng });
  const edgeOrSketch = useEdgeOrSketch({
    mode: overlayMode,
    hiResImageUrl,
    themeColor,
    edgeIntensity,
    subjectFocus,
  });
  const subjectReady = overlayMode === 'subject' && hiResImageUrl.length > 0;

  // Shared metadata + sensor snapshot for the burst/HDR hooks. The hooks
  // mirror inputs into refs internally so it's fine that this object is
  // rebuilt on each render.
  const captureMetadata = useMemo(
    () => ({
      spotId,
      spotName: name,
      animeId: animeId ?? undefined,
      animeTitle: animeTitle || undefined,
      episode: ep ?? undefined,
    }),
    [spotId, name, animeId, animeTitle, ep]
  );
  const getSensorSnapshot = useCallback(
    () => ({
      userLocation: sensors.userLocation,
      heading: sensors.heading,
      tilt: sensors.tilt,
      scoreTotal: sensors.score.total,
    }),
    [sensors.userLocation, sensors.heading, sensors.tilt, sensors.score.total]
  );
  const burst = useBurstCapture({
    cameraRef,
    getSensorSnapshot,
    metadata: captureMetadata,
    colorMatrix: brightness.colorMatrix,
    quality: qualityToNumber(settings.quality),
    silent: settings.mute,
    skipProcessing: settings.skipProcessing,
  });
  const hdr = usePseudoHDR({
    cameraRef,
    getSensorSnapshot,
    metadata: captureMetadata,
    quality: qualityToNumber(settings.quality),
    silent: settings.mute,
    skipProcessing: settings.skipProcessing,
  });
  const countdown = useCaptureCountdown();
  // Capture session — accumulates every shot the user takes this visit
  // (newest first). It survives the camera → preview navigation (the preview
  // is pushed, not replaced) so the multi-shot album can read all shots from
  // one store. Each run{Single|Burst|Hdr} adds the visible/best frame here.
  const captureSession = useCaptureSession();

  // Start a fresh session each time the camera mounts for a spot, so a new
  // pilgrimage visit doesn't surface stale shots. Returning from the preview
  // via router.back() does NOT remount this screen, so the "再拍" round-trip
  // keeps the session intact.
  useEffect(() => {
    captureSession.clearSession();
    // Run once on mount — clearSession is a stable store binding.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // CameraView fires onCameraReady once the native surface is up. We compose
  // three concerns there: (1) flip `isReady` so the warmup spinner clears,
  // (2) re-query physical lenses (the ref is usually null at first render),
  // (3) probe getAvailablePictureSizesAsync so the settings sheet can list
  // real device sizes instead of guessing.
  const handleCameraReady = useCallback(() => {
    onCameraReady();
    void refreshAvailableLenses();
    void refreshAndroidNativeCapabilities();
    const cam = cameraRef.current;
    if (cam && typeof cam.getAvailablePictureSizesAsync === 'function') {
      cam
        .getAvailablePictureSizesAsync()
        .then((sizes) => {
          if (Array.isArray(sizes)) setAvailablePictureSizes(sizes);
        })
        .catch(() => undefined);
    }
  }, [onCameraReady, refreshAvailableLenses, refreshAndroidNativeCapabilities]);

  // CameraView.flash only accepts 'on'|'off'|'auto'; torch surfaces via enableTorch.
  const enableTorch = flashMode === 'torch';
  const cameraFlash: 'on' | 'off' | 'auto' = flashMode === 'torch' ? 'off' : flashMode;
  const androidCameraExtensionMode = androidCameraExtensionModeForCapture(
    Platform.OS,
    settings.captureMode,
    androidNativeCapabilities
  );
  const androidNativeHdrTargeted = shouldUseAndroidNativeHdr(
    Platform.OS,
    settings.captureMode,
    androidNativeCapabilities
  );
  const androidZoomRange =
    Platform.OS === 'android' && useAndroidNativeZoom && androidNativeCapabilities
      ? {
          minZoomRatio: androidNativeCapabilities.minZoomRatio,
          maxZoomRatio: androidNativeCapabilities.maxZoomRatio,
        }
      : null;
  const androidZoomRatio =
    Platform.OS === 'android' && useAndroidNativeZoom
      ? zoomRatioForZoomValue(zoom.zoom, androidNativeCapabilities)
      : undefined;

  useEffect(() => {
    if (permission && !permission.granted && permission.canAskAgain) {
      requestPermission().catch(() => undefined);
    }
  }, [permission, requestPermission]);

  // T1 fix: actually drive CameraView.active off lifecycle events.
  //   - When the app is backgrounded: setActive(false) so iOS pauses the camera
  //     session (saves battery + drops thermal pressure).
  //   - When the settings sheet is open: also setActive(false) — the user can't
  //     see the preview anyway.
  // active is iOS-only effective; on Android the prop is a no-op (no harm).
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      setAppIsForeground(state === 'active');
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    setCameraActive(resolveCameraActive({ appIsForeground, settingsOpen }));
  }, [appIsForeground, settingsOpen, setCameraActive]);

  // T1 fix: when the user flips facing, re-query lenses (iOS exposes a
  // different physical lens set per camera) so the zoom dial reflects reality.
  useEffect(() => {
    void refreshAvailableLenses();
    void refreshAndroidNativeCapabilities();
  }, [facing, refreshAvailableLenses, refreshAndroidNativeCapabilities]);

  const toggleFacing = useCallback(() => {
    hapticsBridge.selection();
    setFacing((f) => (f === 'back' ? 'front' : 'back'));
  }, []);

  const cycleFlash = useCallback(() => {
    hapticsBridge.selection();
    setFlashMode((cur) => {
      const cycle = facing === 'front' ? FLASH_FRONT_CYCLE : FLASH_REAR_CYCLE;
      const idx = cycle.indexOf(cur);
      return cycle[(idx === -1 ? 0 : idx + 1) % cycle.length];
    });
  }, [facing]);

  // Capture mode lives in the top bar — tapping cycles single → burst → hdr
  // and surfaces a short toast describing what the next shutter press will do.
  const cycleCaptureMode = useCallback(() => {
    const idx = CAPTURE_MODE_CYCLE.indexOf(settings.captureMode);
    const next = CAPTURE_MODE_CYCLE[(idx === -1 ? 0 : idx + 1) % CAPTURE_MODE_CYCLE.length];
    hapticsBridge.selection();
    setSettings({ captureMode: next });
    setCaptureModeToast({ mode: next });
  }, [settings.captureMode, setSettings]);

  // Quick overlay-opacity cycle from the top bar — advances through five blend
  // levels with wraparound so the user can tune the overlay without the tool
  // popover covering the preview. A short toast confirms the new level.
  const cycleOverlayOpacity = useCallback(() => {
    setOverlayOpacity((cur) => {
      let nearest = 0;
      for (let i = 1; i < OVERLAY_OPACITY_CYCLE.length; i += 1) {
        if (
          Math.abs(OVERLAY_OPACITY_CYCLE[i] - cur) < Math.abs(OVERLAY_OPACITY_CYCLE[nearest] - cur)
        ) {
          nearest = i;
        }
      }
      const next = OVERLAY_OPACITY_CYCLE[(nearest + 1) % OVERLAY_OPACITY_CYCLE.length];
      hapticsBridge.selection();
      setOverlayOpacityToast({ opacity: next });
      return next;
    });
  }, []);

  // The overlay reposition toggle lives inside the Overlay popover; toggling it
  // closes the popover so the drag surface underneath is clear.
  const handleToggleEdit = useCallback(() => {
    hapticsBridge.selection();
    setEditMode((v) => !v);
    setActiveTool(null);
  }, []);

  useEffect(() => {
    return () => {
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(
        () => undefined
      );
    };
  }, []);

  // Drive the OS orientation lock off the auto/land chip. `auto` unlocks so
  // the device rotates freely; `landscape` pins the screen to landscape.
  //
  // iOS CameraView only re-aligns its live preview to the interface
  // orientation on a *physical* device rotation or a fresh capture session —
  // it never observes the programmatic rotation expo-screen-orientation does
  // here, so a toggle leaves the HUD rotated but the preview stuck sideways.
  // `orientationResyncPending` arms a one-shot CameraView remount that the
  // effect below fires once the rotation has actually settled.
  const [cameraEpoch, setCameraEpoch] = useState(0);
  const orientationResyncPending = useRef(false);
  const orientationInitDone = useRef(false);

  useEffect(() => {
    const lockIntent = cameraOrientationLockIntent(orientationMode);
    const op =
      lockIntent === 'landscape'
        ? ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE)
        : ScreenOrientation.unlockAsync();
    op.catch(() => undefined);
    // The first run is the initial mount: the capture session is brand new
    // and already adopts the current orientation — nothing to re-sync.
    if (!orientationInitDone.current) {
      orientationInitDone.current = true;
      return;
    }
    orientationResyncPending.current = true;
    // Safety disarm: if the toggle doesn't actually rotate the screen (e.g.
    // locking landscape while the device is already landscape) no layout
    // change arrives — drop the arm so a later physical rotation can't trip it.
    const disarm = setTimeout(() => {
      orientationResyncPending.current = false;
    }, 1500);
    return () => clearTimeout(disarm);
  }, [orientationMode]);

  // Once a toggle-driven rotation settles (window dimensions swap), remount
  // CameraView so a fresh capture session adopts the new interface
  // orientation. Physical rotations in `auto` mode never arm the flag — those
  // are handled natively by expo-camera — so they don't trigger a remount.
  useEffect(() => {
    if (!orientationResyncPending.current) return;
    orientationResyncPending.current = false;
    resetCameraLifecycle();
    setCameraEpoch((epoch) => epoch + 1);
  }, [isLandscape, resetCameraLifecycle]);

  // Reset cached spot list whenever the anime context changes, so opening the
  // switcher refetches against the new animeId instead of showing stale spots.
  useEffect(() => {
    setAvailableSpots(null);
  }, [animeId]);

  // Lazily fetch the full points list the first time the user opens the
  // switcher. The repository has in-memory + SQLite caches, so this is
  // near-instant when the user came from the anime detail page (which has
  // already fetched the same payload). Rule 8: on failure / unknown animeId
  // we render an explicit "Unavailable" state — no fake placeholders.
  //
  // NOTE: `spotsLoading` is deliberately NOT in the deps. Including it would
  // cause the effect to re-run when we flip it to `true`, the cleanup would
  // cancel the in-flight fetch, and the data would never land.
  useEffect(() => {
    if (!sceneSwitcherOpen) return;
    if (availableSpots != null) return;
    const bangumiId = Number(animeId);
    if (!Number.isFinite(bangumiId) || bangumiId <= 0) {
      setAvailableSpots([]);
      return;
    }
    let cancelled = false;
    setSpotsLoading(true);
    (async () => {
      try {
        const detailed = await pilgrimageRepository.getDetailedPointsByBangumiId(bangumiId);
        if (cancelled) return;
        if (detailed && detailed.length > 0) {
          setAvailableSpots(detailed);
          return;
        }
        // Detailed returned nothing — fall back to the lite payload so the
        // user at least sees the headline scenes.
        const lite = await pilgrimageRepository.getSpotsByBangumiId(bangumiId);
        if (cancelled) return;
        setAvailableSpots(lite?.litePoints ?? []);
      } catch {
        if (cancelled) return;
        setAvailableSpots([]);
      } finally {
        if (!cancelled) setSpotsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sceneSwitcherOpen, availableSpots, animeId]);

  const handlePickSpot = useCallback(
    (spot: AnitabiPoint) => {
      setSceneSwitcherOpen(false);
      if (spot.id === spotId) return;
      const titles = getPilgrimageSpotTitles(spot);
      const hasGeo =
        Array.isArray(spot.geo) &&
        spot.geo.length === 2 &&
        (spot.geo[0] !== 0 || spot.geo[1] !== 0);
      router.replace({
        pathname: '/pilgrimage/compare/[spotId]',
        params: {
          spotId: spot.id,
          imageUrl: spot.image,
          name: titles.primary,
          ep: String(spot.ep),
          animeId: animeId ?? '',
          animeTitle,
          themeColor,
          spotLat: hasGeo ? String(spot.geo[0]) : '',
          spotLng: hasGeo ? String(spot.geo[1]) : '',
        },
      });
    },
    [router, spotId, animeId, animeTitle, themeColor]
  );

  // Centralised navigation: every capture mode lands on the same preview
  // screen with the same shape of route params. `captureMode` + optional
  // burst fields let the preview render an honest "best of N" badge or a
  // thumbnail strip later. All burst frames are saved (`burst.run` already
  // wrote them to cache); we serialise the URI list so the preview can
  // surface them without a separate fetch.
  //
  // Uses router.push (not replace) so this camera screen stays mounted under
  // the preview — that's what lets the user return ("再拍") via router.back()
  // with the capture session still intact.
  const navigateToPreview = useCallback(
    (shot: {
      uri: string;
      width: number;
      height: number;
      captureMode: 'single' | 'burst' | 'hdr';
      burstTotal?: number;
      burstUris?: string[];
      burstBestIndex?: number;
    }) => {
      router.push({
        pathname: '/pilgrimage/compare/preview',
        params: {
          spotId,
          imageUrl: hiResImageUrl,
          shotUri: shot.uri,
          shotWidth: String(shot.width),
          shotHeight: String(shot.height),
          name,
          ep: ep ?? '',
          animeId: animeId ?? '',
          animeTitle,
          themeColor,
          heading: sensors.heading != null ? sensors.heading.toFixed(0) : '',
          spotLat: params.spotLat ?? '',
          spotLng: params.spotLng ?? '',
          distanceMeters:
            sensors.score.distanceMeters != null ? String(sensors.score.distanceMeters) : '',
          headingDeltaDeg:
            sensors.score.headingDeltaDeg != null ? String(sensors.score.headingDeltaDeg) : '',
          tilt: sensors.tilt != null ? String(sensors.tilt) : '',
          captureMode: shot.captureMode,
          burstTotal: shot.burstTotal != null ? String(shot.burstTotal) : '',
          burstUris: shot.burstUris ? JSON.stringify(shot.burstUris) : '',
          burstBestIndex: shot.burstBestIndex != null ? String(shot.burstBestIndex) : '',
        },
      });
    },
    [
      router,
      spotId,
      hiResImageUrl,
      name,
      ep,
      animeId,
      animeTitle,
      themeColor,
      sensors.heading,
      sensors.score.distanceMeters,
      sensors.score.headingDeltaDeg,
      sensors.tilt,
      params.spotLat,
      params.spotLng,
    ]
  );

  // Add a freshly captured shot to the capture session, snapshotting the
  // sensor readings AT CAPTURE TIME. Rule 8: every sensor field is the real
  // live value or `null` — nothing is invented. Returns the stored record.
  const recordShot = useCallback(
    (shot: {
      uri: string;
      width: number;
      height: number;
      captureMode: 'single' | 'burst' | 'hdr';
      source: 'manual' | 'auto';
      burstTotal?: number;
      burstUris?: string[];
      burstBestIndex?: number;
    }): CaptureSessionShot => {
      const createdAt = Date.now();
      const record: CaptureSessionShot = {
        id: `${createdAt}-${Math.random()}`,
        uri: shot.uri,
        width: shot.width,
        height: shot.height,
        captureMode: shot.captureMode,
        source: shot.source,
        createdAt,
        heading: sensors.heading,
        distanceMeters: sensors.score.distanceMeters,
        headingDeltaDeg: sensors.score.headingDeltaDeg,
        tilt: sensors.tilt,
        burstTotal: shot.burstTotal,
        burstUris: shot.burstUris,
        burstBestIndex: shot.burstBestIndex,
      };
      captureSession.addShot(record);
      return record;
    },
    [
      captureSession,
      sensors.heading,
      sensors.score.distanceMeters,
      sensors.score.headingDeltaDeg,
      sensors.tilt,
    ]
  );

  const maybeCompositeSubjectShot = useCallback(
    async (
      shot: { uri: string; width: number; height: number },
      exif: Record<string, unknown> | null = null
    ): Promise<{ uri: string; width: number; height: number }> => {
      if (
        !shouldCompositeSubjectOverlay({
          mode: overlayMode,
          enabled: subjectCombine,
          subjectReady,
        })
      ) {
        return shot;
      }

      const composite = await compositeSubjectIntoPhoto({
        photoUri: shot.uri,
        referenceUri: hiResImageUrl,
        photoWidth: shot.width,
        photoHeight: shot.height,
        previewWidth: winW,
        previewHeight: winH,
        opacity: overlayOpacity,
        focus: subjectFocus,
        transform: getOverlayTransformSnapshot(),
        quality: qualityToNumber(settings.quality),
        exif,
      });

      return {
        uri: composite.uri,
        width: composite.width || shot.width,
        height: composite.height || shot.height,
      };
    },
    [
      overlayMode,
      subjectCombine,
      subjectReady,
      hiResImageUrl,
      winW,
      winH,
      overlayOpacity,
      subjectFocus,
      getOverlayTransformSnapshot,
      settings.quality,
    ]
  );

  const runSingle = useCallback(
    async (
      source: 'manual' | 'auto' = 'manual',
      captureMode: CaptureMode = 'single'
    ): Promise<CaptureSessionShot | null> => {
      if (!cameraRef.current) return null;
      setCapturing(true);
      try {
        // EXIF metadata embedded into the captured file via expo-camera's native
        // writer. Rule 8: every field is sourced from real sensor data — missing
        // values are simply omitted by buildAdditionalExif.
        const additionalExif = buildAdditionalExif({
          spotId,
          spotName: name,
          animeId: animeId ?? undefined,
          animeTitle: animeTitle || undefined,
          episode: ep ?? undefined,
          userLocation: sensors.userLocation,
          heading: sensors.heading,
          tilt: sensors.tilt,
        });
        const qualityNum = qualityToNumber(settings.quality);

        type ResolvedCapture = {
          uri: string;
          width: number;
          height: number;
          exif: Record<string, unknown> | null;
        };

        const captureClassic = async (): Promise<ResolvedCapture | null> => {
          const photo = await cameraRef.current?.takePictureAsync({
            quality: qualityNum,
            skipProcessing: settings.skipProcessing,
            exif: true,
            additionalExif,
            // Silent shutter belongs on the takePictureAsync option (not CameraView.mute,
            // which is for video audio). `settings.mute` is the user-facing toggle.
            shutterSound: !settings.mute,
          });
          if (!photo) return null;
          const uri = resolveCapturedUri(photo);
          if (!uri) return null;
          return {
            uri,
            width: photo.width || 0,
            height: photo.height || 0,
            exif: mergeCaptureExif(photo.exif, additionalExif),
          };
        };

        let captured: ResolvedCapture | null = null;
        if (Platform.OS === 'ios') {
          try {
            // iOS PictureRef avoids the native-side double-write. The public
            // SavePictureOptions API writes metadata via `metadata`, and iOS
            // native currently returns `url` instead of the JS `uri` shape.
            const pictureRef = await cameraRef.current.takePictureAsync({
              pictureRef: true,
              quality: qualityNum,
              skipProcessing: settings.skipProcessing,
              shutterSound: !settings.mute,
            });
            const saved = await pictureRef.savePictureAsync({
              quality: qualityNum,
              metadata: additionalExif,
            });
            const uri = resolveCapturedUri(saved);
            if (uri) {
              captured = {
                uri,
                width: saved.width || 0,
                height: saved.height || 0,
                exif: additionalExif,
              };
            }
          } catch (pictureRefError) {
            console.warn('[camera] PictureRef capture failed, falling back', pictureRefError);
          }
        }

        captured = captured ?? (await captureClassic());
        if (!captured) return null;

        const baked = await applyBrightnessToImage({
          inputUri: captured.uri,
          exif: captured.exif,
          colorMatrix: brightness.colorMatrix,
          quality: qualityNum,
        });
        const output = await maybeCompositeSubjectShot(
          {
            uri: baked.uri,
            width: baked.width || captured.width,
            height: baked.height || captured.height,
          },
          captured.exif
        );
        tapFocus.releaseLock();
        // Capture is decoupled from navigation: record the shot into the
        // session here; the caller (manual shutter vs auto-capture) decides
        // whether to navigate to the preview or stay on the camera.
        return recordShot({
          uri: output.uri,
          width: output.width,
          height: output.height,
          captureMode,
          source,
        });
      } catch (e) {
        console.warn('[camera] single capture failed', e);
        return null;
      } finally {
        setCapturing(false);
      }
    },
    [
      settings.quality,
      settings.skipProcessing,
      settings.mute,
      brightness.colorMatrix,
      tapFocus,
      maybeCompositeSubjectShot,
      recordShot,
      spotId,
      name,
      ep,
      animeId,
      animeTitle,
      sensors.userLocation,
      sensors.heading,
      sensors.tilt,
    ]
  );

  const runBurst = useCallback(
    async (source: 'manual' | 'auto' = 'manual'): Promise<CaptureSessionShot | null> => {
      const result = await burst.run();
      if (!result) return null;
      tapFocus.releaseLock();
      const idx = result.bestIndex;
      const output = await maybeCompositeSubjectShot({
        uri: result.uris[idx],
        width: result.widths[idx],
        height: result.heights[idx],
      });
      const burstUris = [...result.uris];
      burstUris[idx] = output.uri;
      return recordShot({
        uri: output.uri,
        width: output.width,
        height: output.height,
        captureMode: 'burst',
        source,
        burstTotal: result.total,
        burstUris,
        burstBestIndex: idx,
      });
    },
    [burst, tapFocus, maybeCompositeSubjectShot, recordShot]
  );

  const runHdr = useCallback(
    async (source: 'manual' | 'auto' = 'manual'): Promise<CaptureSessionShot | null> => {
      if (androidNativeHdrTargeted) {
        return runSingle(source, 'hdr');
      }
      const result = await hdr.run();
      if (!result) return null;
      tapFocus.releaseLock();
      const output = await maybeCompositeSubjectShot({
        uri: result.uri,
        width: result.width,
        height: result.height,
      });
      return recordShot({
        uri: output.uri,
        width: output.width,
        height: output.height,
        // Rule 8: when compositing fell back to the mid frame we mark it as
        // single, not HDR — telling the preview screen the truth.
        captureMode: result.wasHdr ? 'hdr' : 'single',
        source,
      });
    },
    [androidNativeHdrTargeted, runSingle, hdr, tapFocus, maybeCompositeSubjectShot, recordShot]
  );

  const anyCapturing = capturing || burst.capturing || hdr.capturing;

  // Run the capture path for the current mode and return the recorded shot.
  // Pure capture-and-record — navigation is the caller's decision.
  const captureForMode = useCallback(
    (source: 'manual' | 'auto'): Promise<CaptureSessionShot | null> => {
      if (settings.captureMode === 'burst') return runBurst(source);
      if (settings.captureMode === 'hdr') return runHdr(source);
      return runSingle(source);
    },
    [settings.captureMode, runBurst, runHdr, runSingle]
  );

  // useAutoCapture watches sensors.score.total + autofocus lock and fires when
  // the user holds the perfect alignment (with AF locked) long enough.
  // `enabled` is the user setting; `captureBusy` pauses watching while any
  // capture is in-flight OR a countdown is running (so we don't double-fire).
  const AUTO_SUSTAIN_MS = 1500;
  const onAutoFireRef = useRef<() => void>(() => undefined);
  const autoCapture = useAutoCapture({
    scoreTotal: sensors.score.total,
    afLocked: tapFocus.afLocked,
    enabled: settings.autoCapture,
    captureBusy: anyCapturing || countdown.isRunning,
    sustainMs: AUTO_SUSTAIN_MS,
    onFire: () => {
      onAutoFireRef.current();
    },
  });

  // Manual shutter press: capture for the current mode, then navigate to the
  // preview. The camera screen stays mounted underneath (router.push).
  const onShutter = useCallback(async () => {
    // Cancel any pending auto-fire FIRST so a manual press doesn't double-fire
    // when the user reflexively taps while auto is arming.
    autoCapture.cancel();
    if (anyCapturing || !cameraRef.current || !cameraIsReady) return;
    // Countdown gate runs before any mode-specific work. `cancel()` on the
    // overlay resolves the promise with `false` so we skip capture entirely.
    if (settings.countdownSeconds > 0) {
      const completed = await countdown.start(settings.countdownSeconds);
      if (!completed) return;
    }
    const shot = await captureForMode('manual');
    if (!shot) return;
    navigateToPreview(shot);
  }, [
    autoCapture,
    anyCapturing,
    cameraIsReady,
    settings.countdownSeconds,
    countdown,
    captureForMode,
    navigateToPreview,
  ]);

  // Auto-capture fire path: capture for the current mode and STAY on the
  // camera so the user can keep pre-shooting. A brief toast confirms the shot
  // with the real running session count.
  const onAutoCapture = useCallback(async () => {
    if (anyCapturing || !cameraRef.current || !cameraIsReady) return;
    if (settings.countdownSeconds > 0) {
      const completed = await countdown.start(settings.countdownSeconds);
      if (!completed) return;
    }
    const shot = await captureForMode('auto');
    if (!shot) return;
    hapticsBridge.success();
    // The session length AFTER this shot landed — read the live store
    // directly (the hook's `shots` in this closure is the stale render-time
    // snapshot). Rule 8: a real count, never a guess.
    setAutoCaptureToast({ sessionCount: getCaptureSessionShots().length });
  }, [anyCapturing, cameraIsReady, settings.countdownSeconds, countdown, captureForMode]);

  // Keep the ref current so useAutoCapture's onFire calls the latest closure.
  useEffect(() => {
    onAutoFireRef.current = () => {
      void onAutoCapture();
    };
  }, [onAutoCapture]);

  // Long-press the shutter to fire a burst regardless of the current mode —
  // power-user shortcut so the user doesn't have to switch modes mid-shot.
  // This is a manual gesture, so it navigates to the preview like onShutter.
  const onShutterLongPress = useCallback(async () => {
    autoCapture.cancel();
    if (anyCapturing || !cameraRef.current || !cameraIsReady) return;
    const shot = await runBurst('manual');
    if (!shot) return;
    navigateToPreview(shot);
  }, [autoCapture, anyCapturing, cameraIsReady, runBurst, navigateToPreview]);

  const onPickFocalStop = useCallback(
    (stop: FocalStop) => {
      if (hasOpticalZoom) setOpticalStop(stop);
      else zoom.setStop(stop);
    },
    [hasOpticalZoom, setOpticalStop, zoom]
  );

  if (!permission) {
    return <View style={[styles.permRoot, { backgroundColor: theme.background.primary }]} />;
  }

  if (!permission.granted) {
    return (
      <View style={[styles.permRoot, { backgroundColor: theme.background.primary }]}>
        <Stack.Screen options={{ headerShown: false }} />
        <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
          <View style={styles.permContent}>
            <Ionicons name="camera-outline" size={48} color={theme.text.secondary} />
            <ThemedText variant="titleLarge" weight="700" align="center">
              Camera access needed
            </ThemedText>
            <ThemedText
              variant="bodyMedium"
              tone="secondary"
              align="center"
              style={{ marginBottom: 8 }}>
              Allow camera so you can frame this scene against its anime reference.
            </ThemedText>
            <Pressable
              onPress={() => {
                hapticsBridge.tap();
                if (permission.canAskAgain) void requestPermission();
                else Linking.openSettings().catch(() => undefined);
              }}
              style={({ pressed }) => [
                styles.permBtn,
                { backgroundColor: themeColor, opacity: pressed ? 0.85 : 1 },
              ]}>
              <ThemedText
                variant="titleSmall"
                weight="700"
                style={{ color: readableTextOn(themeColor) }}>
                {permission.canAskAgain ? 'Grant access' : 'Open Settings'}
              </ThemedText>
            </Pressable>
            <Pressable onPress={() => router.back()} hitSlop={12}>
              <ThemedText variant="bodyMedium" tone="secondary">
                Not now
              </ThemedText>
            </Pressable>
          </View>
        </SafeAreaView>
      </View>
    );
  }

  const activeFocalStop = hasOpticalZoom
    ? (stopForLens(selectedLens) as FocalStop | null)
    : zoom.activeStop;
  const dialAvailableStops = hasOpticalZoom
    ? availableStops
    : useAndroidNativeZoom
      ? androidNativeStops
      : undefined;
  const dialStopZoom = useAndroidNativeZoom ? androidNativeStopZoom : STOP_TO_ZOOM;
  // Android edge-to-edge can report insets.bottom as 0 even when the gesture
  // navigation bar (海帶條) is drawn over the window — floor it so the shutter
  // row + HUD layers always clear the system bar. iOS insets are used as-is.
  const cameraBottomInset = resolveCameraBottomInset(insets.bottom, Platform.OS);
  const safeAreaBottomPad = bottomPad({ bottom: cameraBottomInset });
  // Fixed letterbox bars — neither moves, so every floating HUD layer anchors
  // off this height instead of the old AF-reactive offset that made the dock
  // physically jump 68px the moment tap-to-focus locked.
  const bottomBarHeight = safeAreaBottomPad + CAMERA_BOTTOM_BAR_CONTENT_HEIGHT;
  const focusEvBarBottom = isLandscape ? safeAreaBottomPad + 72 : bottomBarHeight + 12;
  const toolMenuAnchor = resolveCameraToolMenuAnchor({
    topInset: insets.top,
    isLandscape,
  });
  const cameraHudVisibility = resolveTransientCameraHudVisibility({
    toolMenuOpen: activeTool !== null,
    afLocked: tapFocus.afLocked,
  });
  const handleOpenInfo = () => {
    hapticsBridge.tap();
    router.push({ pathname: '/pilgrimage/compare/align', params: { ...params } });
  };
  // One ZoomDial instance, reused: it lives inside the portrait bottom bar and
  // free-floats bottom-left in landscape. Continuous digital zoom writes
  // zoom.zoomShared on the UI thread; labeled detents route through
  // onPickFocalStop so optical lens switching is unchanged.
  const focalDial = (
    <ZoomDial
      zoomShared={zoom.zoomShared}
      activeStop={activeFocalStop}
      themeColor={themeColor}
      availableStops={dialAvailableStops}
      isFrontFacing={facing === 'front'}
      stopZoom={dialStopZoom}
      onPickFocalStop={onPickFocalStop}
      virtualLenses={virtualLenses}
      virtualActive={isVirtualLensActive}
      onPickVirtual={() => {
        const pick = pickAutoVirtualLens(availableLenses);
        if (pick) setVirtualLens(pick);
      }}
    />
  );

  return (
    <GestureHandlerRootView style={styles.root}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.root}>
        <CameraErrorBoundary>
          <CameraStage
            key={cameraEpoch}
            cameraRef={cameraRef}
            facing={facing}
            zoom={zoom.zoom}
            zoomShared={zoom.zoomShared}
            androidZoomRatio={androidZoomRatio}
            androidZoomRange={androidZoomRange}
            androidCameraExtensionMode={androidCameraExtensionMode}
            autofocus={tapFocus.autofocus}
            flashMode={cameraFlash}
            enableTorch={enableTorch}
            selectedLens={selectedLens}
            ratio={aspect === 'full' ? undefined : aspect}
            responsiveOrientationWhenOrientationLocked
            active={cameraActive}
            animateShutter={settings.animateShutter}
            // NOTE: CameraView.mute controls VIDEO recording audio. The silent
            // shutter UI lives on `settings.mute` and is wired to
            // `takePictureAsync({ shutterSound: ... })` in each capture path.
            // Don't forward settings.mute here.
            mirror={settings.mirror}
            pictureSize={resolvePictureSize(settings.resolutionTier, availablePictureSizes)}
            pinchGesture={zoom.pinchGesture}
            tapGesture={tapFocus.tapGesture}
            brightnessOverlayStyle={brightness.overlayStyle}
            onCameraReady={handleCameraReady}
            onMountError={onMountError}
            onAvailableLensesChanged={() => {
              void refreshAvailableLenses();
            }}
            showWarmup={!cameraIsReady}
          />
        </CameraErrorBoundary>

        <OverlayLayer
          mode={overlayMode}
          hiResImageUrl={hiResImageUrl}
          winW={winW}
          winH={winH}
          opacity={overlayOpacity}
          editMode={editMode}
          themeColor={themeColor}
          composedGesture={overlayTransform.composedGesture}
          animatedStyle={overlayTransform.animatedStyle}
          edgeOrSketchImage={edgeOrSketch.image}
          edgeOrSketchLoading={edgeOrSketch.loading}
          edgeOrSketchError={edgeOrSketch.error}
          edgeSourceOpacity={edgeOrSketch.sourceOpacity}
        />

        <View pointerEvents="none" style={StyleSheet.absoluteFill}>
          <View style={styles.levelHorizonWrap}>
            <LevelHorizon tiltShared={sensors.tiltShared} color={themeColor} />
          </View>
          <FocusReticle
            focusPoint={tapFocus.focusPoint}
            accent={themeColor}
            afLocked={tapFocus.afLocked}
          />
        </View>

        <CameraTopBar
          placeName={name}
          themeColor={themeColor}
          topInset={insets.top}
          leftInset={insets.left}
          rightInset={insets.right}
          bottomInset={cameraBottomInset}
          rightRailWidth={isLandscape ? SHUTTER_ROW_LANDSCAPE_WIDTH : 0}
          isLandscape={isLandscape}
          onClose={() => router.back()}
          trailingActions={
            <>
              <CameraHeaderButton
                icon="camera-reverse-outline"
                accessibilityLabel={facing === 'front' ? 'Use back camera' : 'Use front camera'}
                accessibilityState={{ selected: facing === 'front' }}
                themeColor={themeColor}
                active={facing === 'front'}
                onPress={toggleFacing}
              />
              <CameraHeaderButton
                icon={FLASH_ICON[flashMode]}
                accessibilityLabel={`Flash ${flashMode}`}
                themeColor={themeColor}
                active={flashMode !== 'off'}
                onPress={cycleFlash}
              />
              <CameraHeaderButton
                icon="image-outline"
                accessibilityLabel="Overlay tools"
                accessibilityState={{ expanded: activeTool === 'overlay' }}
                themeColor={themeColor}
                active={activeTool === 'overlay' || editMode}
                onPress={() => {
                  hapticsBridge.selection();
                  setActiveTool((t) => (t === 'overlay' ? null : 'overlay'));
                }}
              />
              <CameraHeaderButton
                icon="layers-outline"
                accessibilityLabel={`Overlay opacity ${Math.round(overlayOpacity * 100)}%`}
                themeColor={themeColor}
                active={false}
                onPress={cycleOverlayOpacity}
              />
              <CameraHeaderButton
                icon="sunny-outline"
                accessibilityLabel="Exposure"
                accessibilityState={{ expanded: activeTool === 'exposure' }}
                themeColor={themeColor}
                active={activeTool === 'exposure'}
                onPress={() => {
                  hapticsBridge.selection();
                  setActiveTool((t) => (t === 'exposure' ? null : 'exposure'));
                }}
              />
              <CameraHeaderButton
                icon={CAPTURE_MODE_ICON[settings.captureMode]}
                accessibilityLabel={`Capture mode: ${settings.captureMode}`}
                themeColor={themeColor}
                active={settings.captureMode !== 'single'}
                onPress={cycleCaptureMode}
              />
              <CameraHeaderButton
                icon="settings-outline"
                accessibilityLabel="Camera settings"
                accessibilityState={{ expanded: settingsOpen }}
                themeColor={themeColor}
                active={settingsOpen}
                onPress={() => {
                  hapticsBridge.tap();
                  setSettingsOpen(true);
                }}
              />
              <CameraHeaderButton
                icon={activeTool === 'more' ? 'close' : 'ellipsis-horizontal'}
                accessibilityLabel={
                  activeTool === 'more' ? 'Close camera tools' : 'More camera tools'
                }
                accessibilityState={{ expanded: activeTool === 'more' }}
                themeColor={themeColor}
                active={activeTool === 'more'}
                onPress={() => {
                  hapticsBridge.selection();
                  setActiveTool((t) => (t === 'more' ? null : 'more'));
                }}
              />
            </>
          }
        />

        <AlignmentHUD
          score={sensors.score}
          themeColor={themeColor}
          topInset={insets.top}
          bottomInset={cameraBottomInset}
          bottomBarHeight={bottomBarHeight}
          leftReserve={isLandscape ? CAMERA_SIDE_RAIL_WIDTH + insets.left : 0}
          isLandscape={isLandscape}
          transformed={overlayTransform.transformed}
          rotationDisplayDeg={overlayTransform.rotationDisplayDeg}
          showPerfectBanner={sensors.showPerfectBanner}
          onReset={overlayTransform.resetTransforms}
        />

        {/* Landscape floats the zoom dial just inside the left rail; in
            portrait it lives inside the fixed bottom bar (ShutterRow). */}
        {isLandscape ? (
          <View
            pointerEvents="box-none"
            style={[
              styles.landscapeFocalDock,
              {
                left: CAMERA_SIDE_RAIL_WIDTH + insets.left + 16,
                bottom: safeAreaBottomPad + 16,
              },
            ]}>
            {focalDial}
          </View>
        ) : null}

        {cameraHudVisibility.showFocusExposureBar ? (
          <FocusExposureBar
            value={evValue}
            themeColor={themeColor}
            bottomOffset={focusEvBarBottom}
            isLandscape={isLandscape}
            onChange={setEvValue}
          />
        ) : null}

        <View
          pointerEvents="none"
          style={[
            styles.autoBadgeWrap,
            isLandscape
              ? { right: SHUTTER_ROW_LANDSCAPE_WIDTH + 12, bottom: safeAreaBottomPad + 80 }
              : { left: 0, right: 0, bottom: bottomBarHeight + 84 },
            // The tool menu popover covers this region — drop it out entirely
            // while the menu is open so nothing peeks past the panel edges.
            !cameraHudVisibility.showAutoCaptureBadge && styles.hidden,
          ]}>
          <AutoCaptureStatusBadge
            remainingMs={autoCapture.remainingMs}
            sustainMs={AUTO_SUSTAIN_MS}
            themeColor={themeColor}
          />
        </View>

        <View
          pointerEvents="box-none"
          style={[
            styles.captureHistoryWrap,
            isLandscape
              ? {
                  // Clears the compact landscape top bar (≈ insets.top + 48).
                  right: SHUTTER_ROW_LANDSCAPE_WIDTH + 8,
                  top: insets.top + 56,
                  bottom: safeAreaBottomPad + 96,
                  width: 56,
                }
              : {
                  left: 0,
                  right: 0,
                  bottom: bottomBarHeight + 12,
                  height: 60,
                },
            !cameraHudVisibility.showCaptureHistory && styles.hidden,
          ]}>
          <CaptureHistoryStrip
            uris={captureSession.shots.map((s) => s.uri)}
            onSelect={(uri) => {
              // Resolve the matching session shot so the preview gets the real
              // dimensions + burst metadata, not a synthetic zero-sized shot.
              const shot = captureSession.shots.find((s) => s.uri === uri);
              if (shot) navigateToPreview(shot);
            }}
            themeColor={themeColor}
            isLandscape={isLandscape}
          />
        </View>

        <ShutterRow
          themeColor={themeColor}
          referenceImageUrl={imageUrl}
          capturing={anyCapturing}
          isLandscape={isLandscape}
          topInset={insets.top}
          bottomInset={cameraBottomInset}
          focalSlot={isLandscape ? undefined : focalDial}
          onShutter={onShutter}
          onLongPress={onShutterLongPress}
          burst={
            burst.capturing
              ? { active: true, captured: burst.captured, total: burst.total }
              : undefined
          }
          onOpenMap={() =>
            router.push({
              pathname: '/(tabs)/pilgrimage/map',
              params: { spotId, animeId: animeId ?? '' },
            })
          }
          onPickReference={() => {
            hapticsBridge.tap();
            setSceneSwitcherOpen(true);
          }}
        />

        {/* Capture-mode change feedback — a brief toast naming the new mode.
            Rendered before the tool popover so the popover layers above it. */}
        <View
          pointerEvents="none"
          style={[
            styles.modeToastWrap,
            isLandscape
              ? {
                  left: CAMERA_SIDE_RAIL_WIDTH + insets.left,
                  right: SHUTTER_ROW_LANDSCAPE_WIDTH,
                  bottom: safeAreaBottomPad + 24,
                }
              : { left: 0, right: 0, bottom: bottomBarHeight + 84 },
          ]}>
          <CaptureModeToast
            toast={captureModeToast}
            themeColor={themeColor}
            nativeHdrActive={androidNativeHdrTargeted}
          />
          <OverlayOpacityToast toast={overlayOpacityToast} themeColor={themeColor} />
          <AutoCaptureToast toast={autoCaptureToast} themeColor={themeColor} />
        </View>

        {/* Secondary-tool popover. Each top-bar tool icon opens this panel with
            just that tool's controls. Rendered at screen root (after ShutterRow)
            so it floats above every HUD layer and is reliably touchable. */}
        <CameraToolMenu
          tool={activeTool}
          onRequestClose={() => setActiveTool(null)}
          themeColor={themeColor}
          topOffset={toolMenuAnchor.topOffset}
          leftOffset={toolMenuAnchor.leftOffset}
          rightOffset={toolMenuAnchor.rightOffset}
          bottomReserve={isLandscape ? safeAreaBottomPad + 24 : bottomBarHeight}
          cycleChips={
            <>
              <CountdownChip
                seconds={settings.countdownSeconds}
                onChange={(s) => setSettings({ countdownSeconds: s })}
              />
              <AspectChip aspect={aspect} onChange={setAspect} />
              <OrientationChip mode={orientationMode} onChange={setOrientationMode} />
            </>
          }
          overlayControls={
            <OverlayControls
              mode={overlayMode}
              edgeIntensity={edgeIntensity}
              subjectFocus={subjectFocus}
              subjectCombine={subjectCombine}
              opacity={overlayOpacity}
              flipped={overlayTransform.flipped}
              editMode={editMode}
              themeColor={themeColor}
              onSelectMode={setOverlayMode}
              onSelectEdgeIntensity={setEdgeIntensity}
              onSelectSubjectFocus={setSubjectFocus}
              onToggleSubjectCombine={() => setSubjectCombine((v) => !v)}
              onChangeOpacity={setOverlayOpacity}
              onToggleFlip={overlayTransform.toggleFlip}
              onToggleEdit={handleToggleEdit}
            />
          }
          exposureControls={<ExposureControls value={evValue} onChange={setEvValue} />}
          onOpenTips={handleOpenInfo}
        />

        <CountdownOverlay
          remaining={countdown.remaining}
          themeColor={themeColor}
          onCancel={countdown.cancel}
        />

        <CameraSettingsSheet
          visible={settingsOpen}
          onClose={() => setSettingsOpen(false)}
          settings={settings}
          onSettingsChange={setSettings}
        />

        <SceneSwitcherSheet
          visible={sceneSwitcherOpen}
          onClose={() => setSceneSwitcherOpen(false)}
          spots={availableSpots}
          currentSpotId={spotId}
          themeColor={themeColor}
          onPickSpot={handlePickSpot}
          loading={spotsLoading}
        />
      </View>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  permRoot: { flex: 1 },
  permContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 12,
  },
  permBtn: { paddingHorizontal: 24, paddingVertical: 12, borderRadius: 999, marginTop: 12 },
  landscapeFocalDock: {
    position: 'absolute',
    zIndex: 60,
  },
  autoBadgeWrap: { position: 'absolute', alignItems: 'center' },
  // Sits above the place badge (z 70) but below the tool popover (z 100).
  modeToastWrap: { position: 'absolute', alignItems: 'center', zIndex: 80 },
  captureHistoryWrap: { position: 'absolute', alignItems: 'center' },
  hidden: { display: 'none' },
  levelHorizonWrap: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
