import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
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
import { useSharedValue } from 'react-native-reanimated';
import { useCameraPermission } from 'react-native-vision-camera';
import * as FileSystem from 'expo-file-system/legacy';
import * as ImagePicker from 'expo-image-picker';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as ScreenOrientation from 'expo-screen-orientation';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { bottomPad } from '../../../../constants/DesignSystem';
import { useTheme } from '../../../../context/ThemeContext';
import { hapticsBridge } from '../../../../modules/haptics/hapticsBridge';
import { ThemedText, readableTextOn } from '../../../../components/themed';
import { toFullResImageUrl } from '../../../../libs/services/pilgrimage/anitabi-image';
import { compositeSubjectIntoPhoto } from '../../../../libs/services/pilgrimage/subject-composite';
import { shouldCompositeSubjectOverlay } from '../../../../libs/services/pilgrimage/subject-composite-plan';
import { buildAdditionalExif } from '../../../../libs/services/pilgrimage/build-exif-metadata';
import { getPilgrimageSpotTitles } from '../../../../libs/services/pilgrimage/pilgrimage-localization';
import type { AnitabiPoint } from '../../../../libs/services/pilgrimage/types';
import {
  cameraOrientationLockIntent,
  CAMERA_BOTTOM_BAR_CONTENT_HEIGHT,
  resolveCameraBottomInset,
  resolveCameraActive,
  resolveCameraTopChromeHeight,
  resolveTransientCameraHudVisibility,
} from '../../../../libs/services/pilgrimage/camera-ui';
import { embedCaptureMetadata } from '../../../../libs/services/pilgrimage/embed-capture-metadata';
import { availableStopsFromDeviceInfo } from '../../../../libs/services/pilgrimage/lens-switching';
import { captureAnalysisGate } from '../../../../libs/services/pilgrimage/capture-lens-gate';
import { useResolvedCameraDevices } from '../../../../hooks/useResolvedCameraDevices';
import { useStrategicCameraDevice } from '../../../../hooks/useStrategicCameraDevice';
import type {
  CameraDeviceInfo,
  CameraEngineHandle,
} from '../../../../components/pilgrimage/camera/camera-engine';
import CameraErrorBoundary from '../../../../components/pilgrimage/camera/CameraErrorBoundary';
import { CameraStage } from '../../../../components/pilgrimage/camera/CameraStage';
import OverlayLayer from '../../../../components/pilgrimage/camera/OverlayLayer';
import { FocusReticle } from '../../../../components/pilgrimage/camera/FocusReticle';
import { LevelHorizon } from '../../../../components/pilgrimage/camera/LevelHorizon';
import FocusExposureBar from '../../../../components/pilgrimage/camera/FocusExposureBar';
import CameraTopBar, {
  CameraHeaderButton,
} from '../../../../components/pilgrimage/camera/CameraTopBar';
import AlignmentHUD from '../../../../components/pilgrimage/camera/AlignmentHUD';
import ZoomDial from '../../../../components/pilgrimage/camera/ZoomDial';
import ShutterRow, {
  SHUTTER_ROW_LANDSCAPE_WIDTH,
} from '../../../../components/pilgrimage/camera/ShutterRow';
import ReferenceThumbnail from '../../../../components/pilgrimage/camera/ReferenceThumbnail';
import OverlayDock from '../../../../components/pilgrimage/camera/OverlayDock';
import OverlayControlsBar from '../../../../components/pilgrimage/camera/OverlayControlsBar';
import CameraChip from '../../../../components/pilgrimage/camera/chips/CameraChip';
import AspectChip from '../../../../components/pilgrimage/camera/chips/AspectChip';
import CountdownChip from '../../../../components/pilgrimage/camera/chips/CountdownChip';
import OrientationChip from '../../../../components/pilgrimage/camera/chips/OrientationChip';
import CameraSettingsSheet from '../../../../components/pilgrimage/camera/CameraSettingsSheet';
import { CountdownOverlay } from '../../../../components/pilgrimage/camera/CountdownOverlay';
import CamSwitchToast, {
  type CamSwitchToastValue,
} from '../../../../components/pilgrimage/camera/CamSwitchToast';
import type {
  FlashMode,
  FocalStop,
  OverlayMode,
} from '../../../../components/pilgrimage/camera/types';
import { useCameraZoom, STOP_TO_ZOOM } from '../../../../hooks/useCameraZoom';
import { useTapToFocus } from '../../../../hooks/useTapToFocus';
import { useOverlayTransform } from '../../../../hooks/useOverlayTransform';
import { useAlignmentSensors } from '../../../../hooks/useAlignmentSensors';
import { useEdgeOrSketch } from '../../../../hooks/useEdgeOrSketch';
import {
  useCameraSettings,
  qualityToNumber,
  qualityToPrioritization,
  type CaptureMode,
} from '../../../../hooks/useCameraSettings';
import { useCameraHud } from '../../../../hooks/useCameraHud';
import { useSceneSwitcherSpots } from '../../../../hooks/useSceneSwitcherSpots';
import { useCameraLifecycle } from '../../../../hooks/useCameraLifecycle';
import { useBurstCapture } from '../../../../hooks/useBurstCapture';
import { useCaptureCountdown } from '../../../../hooks/useCaptureCountdown';
import { useExposureBracket } from '../../../../hooks/useExposureBracket';
import { useSceneAnalyzer } from '../../../../hooks/useSceneAnalyzer';
import { useAutoCapture } from '../../../../hooks/useAutoCapture';
import { useCaptureSession } from '../../../../hooks/useCaptureSession';
import {
  buildLibraryCaptureSessionShot,
  getShots as getCaptureSessionShots,
  type CaptureSessionShot,
} from '../../../../libs/services/pilgrimage/capture-session';
import { locationService } from '../../../../libs/services/pilgrimage/location-service';
import AutoCaptureStatusBadge from '../../../../components/pilgrimage/camera/AutoCaptureBadge';
import CaptureHistoryStrip from '../../../../components/pilgrimage/camera/CaptureHistoryStrip';
import SceneSwitcherSheet from '../../../../components/pilgrimage/camera/SceneSwitcherSheet';
import CaptureModeToast from '../../../../components/pilgrimage/camera/CaptureModeToast';

import AutoCaptureToast from '../../../../components/pilgrimage/camera/AutoCaptureToast';

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

// Overlay mode switch toast copy — shown briefly when the user taps a mode pill.
const OVERLAY_MODE_TOAST: Record<OverlayMode | 'off', CamSwitchToastValue> = {
  off: { icon: 'eye-off-outline', label: 'Overlay Off' },
  anime: { icon: 'image-outline', label: 'Anime', hint: 'Original scene overlay' },
  edge: { icon: 'analytics-outline', label: 'Edge', hint: 'Edge detection overlay' },
  sketch: { icon: 'pencil-outline', label: 'Sketch', hint: 'Sketch style overlay' },
  subject: { icon: 'person-outline', label: 'Subject', hint: 'Subject extract overlay' },
};

// Capture mode is a top-bar icon button that cycles single → burst → auto; the
// icon mirrors the live mode and a toast explains each mode on change. 'auto'
// replaces the retired 'hdr' mode — it captures a single shot when the scene
// looks well-exposed, and falls through to a real 3-frame exposure bracket
// (or native single-shot HDR when the device supports it) when the scene
// detector flags clipped shadows + highlights.
const CAPTURE_MODE_ICON: Record<CaptureMode, keyof typeof Ionicons.glyphMap> = {
  single: 'camera-outline',
  burst: 'albums-outline',
  auto: 'sparkles-outline',
};
const CAPTURE_MODE_CYCLE: CaptureMode[] = ['single', 'burst', 'auto'];

const IMPORTED_CAPTURE_DIR = FileSystem.documentDirectory
  ? `${FileSystem.documentDirectory}pilgrimage-imports/`
  : null;

function importedCaptureExtension(asset: ImagePicker.ImagePickerAsset): string {
  const candidate = asset.fileName ?? asset.uri;
  const clean = candidate.split('?')[0] ?? '';
  const match = clean.match(/\.([a-z0-9]+)$/i);
  const ext = match?.[1]?.toLowerCase();
  if (!ext) return 'jpg';
  if (ext === 'jpeg') return 'jpg';
  return ['jpg', 'png', 'webp', 'heic', 'heif'].includes(ext) ? ext : 'jpg';
}

async function copyImportedCapture(asset: ImagePicker.ImagePickerAsset): Promise<string> {
  if (!IMPORTED_CAPTURE_DIR) return asset.uri;
  const info = await FileSystem.getInfoAsync(IMPORTED_CAPTURE_DIR);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(IMPORTED_CAPTURE_DIR, { intermediates: true });
  }
  const dest = `${IMPORTED_CAPTURE_DIR}${Date.now()}-${Math.random()
    .toString(36)
    .slice(2)}.${importedCaptureExtension(asset)}`;
  await FileSystem.copyAsync({ from: asset.uri, to: dest });
  return dest;
}

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
  // The engine handle is owned by CameraStage and exposed via the ref.
  const cameraRef = useRef<CameraEngineHandle | null>(null);
  const { hasPermission, requestPermission, canRequestPermission, status } = useCameraPermission();

  // CLAUDE.md Rule 9: the camera HUD's discrete interaction state (facing,
  // flash, aspect, overlay config, panels, toasts) lives in one reducer hook,
  // not ~19 loose top-level useStates. Destructured so existing reads stay as
  // bare identifiers; writes go through `setHud(patch)`.
  const { hud, setHud } = useCameraHud();
  const {
    facing,
    flashMode,
    aspect,
    overlayMode,
    edgeIntensity,
    subjectFocus,
    subjectCombine,
    overlayOpacity,
    editMode,
    evValue,
    orientationMode,
    settingsOpen,
    quickControlsOpen,
    overlayDockOpen,
    overlayVisible,
    captureModeToast,
    autoCaptureToast,
    switchToast,
    sceneSwitcherOpen,
  } = hud;
  // Capture-in-flight flag — rendered via `anyCapturing` → ShutterRow.
  const [capturing, setCapturing] = useState(false);
  const [appIsForeground, setAppIsForeground] = useState(() => AppState.currentState === 'active');
  // Real device capabilities reported by VisionCamera through the engine. Null
  // until the first device pick resolves; drives zoom range, HDR availability,
  // and the focal-stop pill set on the dial.
  const [deviceInfo, setDeviceInfo] = useState<CameraDeviceInfo | null>(null);
  // Scene-switcher spot list — lazily fetched the first time the sheet opens.
  const { spots: availableSpots, loading: spotsLoading } = useSceneSwitcherSpots(
    animeId,
    sceneSwitcherOpen
  );

  const { settings, setSettings } = useCameraSettings();
  const lifecycle = useCameraLifecycle(true);
  const {
    active: cameraActive,
    isReady: cameraIsReady,
    onCameraReady,
    onMountError,
    setActive: setCameraActive,
  } = lifecycle;

  // Cohort hint: derives `{ strategy, hasStandaloneUltraWide }` from the
  // full device list so the dial can route the 0.5 affordance correctly
  // — onto the ISLAND chip (Android standalone-switch) or onto the strip
  // (iOS / Xiaomi-style logical, where the active session covers 0.5
  // continuously). The strategic hook then drives the actual session swap
  // when the island is tapped.
  const { cohort, cachedSnapshot } = useResolvedCameraDevices(facing);
  // While the live cohort enumerates (cold launch, ~150–500ms on Android),
  // fall back to last session's cached snapshot so the dial paints its
  // final layout on frame 1 instead of flashing [1, max] → [0.5, 1, max].
  // The cache stores strategy + device IDs, not live `CameraDevice`
  // handles, so it's safe ONLY for layout decisions (cohortHint) — never
  // for opening a session, which always uses the live `cohort`.
  const cohortHint = useMemo(() => {
    if (cohort) {
      return {
        strategy: cohort.strategy,
        hasStandaloneUltraWide: cohort.ultraWide !== undefined,
      };
    }
    if (cachedSnapshot) {
      return {
        strategy: cachedSnapshot.strategy,
        hasStandaloneUltraWide: cachedSnapshot.ultraWideDeviceId !== undefined,
      };
    }
    return undefined;
  }, [cohort, cachedSnapshot]);
  // Strategic device: runs the lens-switch FSM (dwell-then-switch + tap-
  // bypass). `activeDevice` is what CameraStage opens its session on;
  // `requestSwitch` is what ZoomDial's island chip calls.
  const strategic = useStrategicCameraDevice(cohort);

  // Snapshot of the previous lens's preview, captured right before a session
  // swap so CameraStage can render it as a freeze-frame overlay while
  // CameraX tears down the old session. Android-only (engine.takeSnapshot
  // returns null on iOS); the animated vignette covers the iOS path.
  const [freezeFrameUri, setFreezeFrameUri] = useState<string | null>(null);

  // Clear the freeze-frame once the new session is up and the warmup overlay
  // has finished its fade-out (~250ms). Also delete the temp file so we don't
  // leak ~100 kB JPEGs into the cache each swap.
  useEffect(() => {
    if (strategic.isSwitching) return;
    if (!freezeFrameUri) return;
    const uri = freezeFrameUri;
    const timer = setTimeout(() => {
      setFreezeFrameUri(null);
      // Best-effort cleanup; if the file vanished already or the path is
      // malformed we just move on. No error toast — the snapshot is purely a
      // visual nicety; failure should never reach the user.
      FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => undefined);
    }, 260);
    return () => clearTimeout(timer);
  }, [strategic.isSwitching, freezeFrameUri]);

  // Wrapper around the FSM's `requestSwitch` that grabs a freeze-frame first
  // (fire-and-forget — the snapshot Promise is allowed to land after the
  // dispatch). The native takeSnapshot call is issued synchronously so the
  // preview buffer is read while it's still showing the OLD lens; the JS
  // Promise just tells us when the file is on disk. Tap-island happens
  // immediately after, so the FSM doesn't wait on disk I/O.
  const handleRequestSwitch = useCallback(
    (target: 'wide' | 'ultra-wide') => {
      if (Platform.OS === 'android') {
        const snap = cameraRef.current?.takeSnapshot();
        if (snap) {
          snap
            .then((uri) => {
              if (uri) setFreezeFrameUri(uri);
            })
            .catch(() => undefined);
        }
      }
      strategic.requestSwitch(target);
    },
    [strategic]
  );
  // Compose `onCameraReady` with the FSM's `onCameraStarted` so the FSM
  // learns when a session swap has completed and flips back to STABLE.
  const handleCameraReady = useCallback(() => {
    strategic.onCameraStarted();
    onCameraReady();
  }, [strategic, onCameraReady]);
  const handleMountError = useCallback(
    (e: { nativeEvent: { message: string } }) => {
      strategic.onCameraError(e.nativeEvent.message);
      onMountError(e);
    },
    [strategic, onMountError]
  );
  // Surface lens-switch failures via the existing switch-toast HUD slot.
  // Without this, a CAMERA_ERROR leaves the FSM in ERROR phase silently:
  // `activeDevice` falls back to the previous lens (so the preview still
  // works) but the user has no idea their requested swap didn't take.
  useEffect(() => {
    if (!strategic.error) return;
    setHud({
      switchToast: {
        icon: 'alert-circle-outline',
        label: '切換失敗，已退回主鏡頭',
      },
    });
  }, [strategic.error, setHud]);

  // Zoom is in REAL factor units now (e.g. 1×, 2×, 3×). Bounds + available
  // pillars come straight from the device — no expo-camera-era guesses.
  const availableStops = useMemo(
    () => availableStopsFromDeviceInfo(deviceInfo, 3, cohortHint),
    [deviceInfo, cohortHint]
  );
  const minZoom = deviceInfo?.minZoom ?? 1;
  const maxZoom = deviceInfo?.maxZoom ?? 1;
  const zoom = useCameraZoom({
    initial: 1,
    minZoom,
    maxZoom,
    stops: availableStops,
  });

  const tapFocus = useTapToFocus({
    lockTimeoutMs: 5000,
    onFocus: (point) => {
      // Drives a real AE/AF/AWB metering operation at the tap location.
      void cameraRef.current?.focus(point);
    },
  });

  // Exposure SharedValue mirrored from the HUD EV slider. CameraStage feeds
  // this straight to VisionCamera's `exposure` prop — REAL EV bias, not a
  // post-capture brightness fake. Clamped to the device's reported bias range
  // so we never push values the OS will reject.
  const exposureShared = useSharedValue(0);
  useEffect(() => {
    const min = deviceInfo?.minExposureBias ?? 0;
    const max = deviceInfo?.maxExposureBias ?? 0;
    exposureShared.value = Math.max(min, Math.min(max, evValue));
  }, [evValue, deviceInfo, exposureShared]);

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

  // Live alignment snapshot shared with burst / HDR + EXIF embed flows.
  const getSensorSnapshot = useCallback(
    () => ({
      userLocation: sensors.userLocation,
      heading: sensors.heading,
      tilt: sensors.tilt,
      scoreTotal: sensors.score.total,
    }),
    [sensors.userLocation, sensors.heading, sensors.tilt, sensors.score.total]
  );

  // Flash on the back camera supports torch; on the front it cycles off/auto/on.
  // The torch is a live Camera prop, the flash is a per-capture takePhoto opt.
  const enableTorch = flashMode === 'torch';
  const captureFlash: 'on' | 'off' | 'auto' = flashMode === 'torch' ? 'off' : flashMode;

  // Auto mode runs the scene analyzer at ~5 Hz. When it flags clipped shadows
  // + highlights AND the device supports native photo-HDR, the camera mounts
  // with the PhotoHDR constraint so a single takePhoto already produces a true
  // HDR JPEG. Otherwise the auto path falls through to a real 3-frame
  // exposure bracket via `useExposureBracket`.
  const sceneAnalyzer = useSceneAnalyzer({ enabled: settings.captureMode === 'auto' });
  const realHdrTargeted =
    settings.captureMode === 'auto' &&
    sceneAnalyzer.hdrRecommended &&
    (deviceInfo?.supportsPhotoHdr ?? false);

  const burst = useBurstCapture({
    engineRef: cameraRef,
    getSensorSnapshot,
    silent: settings.mute,
    flashMode: captureFlash,
  });
  const bracket = useExposureBracket({
    engineRef: cameraRef,
    exposureShared,
    evBiasRange: {
      min: deviceInfo?.minExposureBias ?? 0,
      max: deviceInfo?.maxExposureBias ?? 0,
    },
    restoreEv: evValue,
    quality: qualityToNumber(settings.quality),
    silent: settings.mute,
    flashMode: 'off',
  });
  const countdown = useCaptureCountdown();
  // Capture session — accumulates every shot the user takes this visit
  // (newest first). It survives the camera → preview navigation (the preview
  // is pushed, not replaced) so the multi-shot album can read all shots from
  // one store. Each run{Single|Burst|Auto|HdrBracket} adds the visible/best
  // frame here.
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

  // Re-request permission when the user is in 'not-determined' on mount.
  useEffect(() => {
    if (!hasPermission && canRequestPermission) {
      requestPermission().catch(() => undefined);
    }
  }, [hasPermission, canRequestPermission, requestPermission]);

  // T1 fix: drive the camera's active flag off app lifecycle + settings sheet.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      setAppIsForeground(state === 'active');
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    setCameraActive(resolveCameraActive({ appIsForeground, settingsOpen }));
  }, [appIsForeground, settingsOpen, setCameraActive]);

  const toggleFacing = useCallback(() => {
    hapticsBridge.selection();
    setHud((h) => ({ facing: h.facing === 'back' ? 'front' : 'back' }));
  }, [setHud]);

  const cycleFlash = useCallback(() => {
    hapticsBridge.selection();
    setHud((h) => {
      const cycle = h.facing === 'front' ? FLASH_FRONT_CYCLE : FLASH_REAR_CYCLE;
      const idx = cycle.indexOf(h.flashMode);
      return { flashMode: cycle[(idx === -1 ? 0 : idx + 1) % cycle.length] };
    });
  }, [setHud]);

  // Capture mode lives in the top bar — tapping cycles single → burst → auto
  // and surfaces a short toast describing what the next shutter press will do.
  const cycleCaptureMode = useCallback(() => {
    const idx = CAPTURE_MODE_CYCLE.indexOf(settings.captureMode);
    const next = CAPTURE_MODE_CYCLE[(idx === -1 ? 0 : idx + 1) % CAPTURE_MODE_CYCLE.length];
    hapticsBridge.selection();
    setSettings({ captureMode: next });
    setHud({ captureModeToast: { mode: next } });
  }, [settings.captureMode, setSettings, setHud]);

  const handleToggleEdit = useCallback(() => {
    hapticsBridge.selection();
    setHud((h) => ({ editMode: !h.editMode }));
  }, [setHud]);

  useEffect(() => {
    return () => {
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(
        () => undefined
      );
    };
  }, []);

  // Drive the OS orientation lock off the auto/land chip. VisionCamera realigns
  // its own preview natively via `orientationSource="interface"`, so unlike
  // expo-camera we no longer need the keyed-remount trick to clear a stale
  // preview rotation.
  useEffect(() => {
    const lockIntent = cameraOrientationLockIntent(orientationMode);
    const op =
      lockIntent === 'landscape'
        ? ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE)
        : ScreenOrientation.unlockAsync();
    op.catch(() => undefined);
  }, [orientationMode]);

  const handlePickSpot = useCallback(
    (spot: AnitabiPoint) => {
      setHud({ sceneSwitcherOpen: false });
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
    [router, spotId, animeId, animeTitle, themeColor, setHud]
  );

  // Centralised navigation: every capture mode lands on the same preview
  // screen with the same shape of route params.
  const navigateToPreview = useCallback(
    (shot: CaptureSessionShot) => {
      router.push({
        pathname: '/pilgrimage/compare/preview',
        params: {
          spotId,
          imageUrl: hiResImageUrl,
          shotUri: shot.uri,
          shotWidth: String(shot.width),
          shotHeight: String(shot.height),
          capturedAt: String(shot.createdAt),
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
          shotSource: shot.source,
          userLat: shot.userLocation?.latitude != null ? String(shot.userLocation.latitude) : '',
          userLng: shot.userLocation?.longitude != null ? String(shot.userLocation.longitude) : '',
          note: shot.note ?? '',
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
      /** Physical lens family the capture was taken on — surfaced from
       *  the engine so the album/preview can gate cross-lens analysis. */
      lensType?: 'ultra-wide-angle' | 'wide-angle' | 'telephoto';
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
        userLocation: sensors.userLocation,
        burstTotal: shot.burstTotal,
        burstUris: shot.burstUris,
        burstBestIndex: shot.burstBestIndex,
        lensType: shot.lensType,
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
      sensors.userLocation,
    ]
  );

  // Build the EXIF payload from the current sensor snapshot + route params.
  // Centralised so single/burst/HDR all stamp the same set of tags.
  const buildExifNow = useCallback(() => {
    return buildAdditionalExif({
      spotId,
      spotName: name,
      animeId: animeId ?? undefined,
      animeTitle: animeTitle || undefined,
      episode: ep ?? undefined,
      userLocation: sensors.userLocation,
      heading: sensors.heading,
      tilt: sensors.tilt,
    });
  }, [spotId, name, animeId, animeTitle, ep, sensors.userLocation, sensors.heading, sensors.tilt]);

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
      // Recorded SHOT-level mode (NOT the user-facing CaptureMode). The shot
      // store still distinguishes 'hdr' from 'single' because we want the
      // preview/album to label a native single-shot HDR honestly even though
      // 'hdr' is no longer a user-facing setting.
      captureMode: CaptureSessionShot['captureMode'] = 'single'
    ): Promise<CaptureSessionShot | null> => {
      const engine = cameraRef.current;
      if (!engine) return null;
      setCapturing(true);
      try {
        const additionalExif = buildExifNow();
        const photo = await engine.takePhoto({
          flashMode: captureFlash,
          enableShutterSound: !settings.mute,
        });
        if (!photo?.uri) return null;
        // VisionCamera writes raw bytes — embed our EXIF (anime title, scene,
        // GPS, heading, tilt) onto the JPEG ourselves. Failure is logged and
        // ignored; the photo survives without metadata rather than disappear.
        await embedCaptureMetadata(photo.uri, additionalExif);
        const output = await maybeCompositeSubjectShot(
          { uri: photo.uri, width: photo.width, height: photo.height },
          additionalExif
        );
        tapFocus.releaseLock();
        // Lens-gate banner: when the capture was taken on the standalone
        // ultra-wide (or telephoto) we surface a short toast so the user
        // understands why the post-capture analytics card will be missing
        // for this shot. Wide-angle captures get no banner (the default
        // flow is unchanged). See `capture-lens-gate.ts` for the policy.
        const gate = captureAnalysisGate({ lensType: photo.lensType });
        if (gate.bannerMessage) {
          setHud({
            switchToast: {
              icon: 'information-circle-outline',
              label: gate.bannerMessage,
            },
          });
        }
        return recordShot({
          uri: output.uri,
          width: output.width,
          height: output.height,
          captureMode,
          source,
          lensType: photo.lensType,
        });
      } catch (e) {
        console.warn('[camera] single capture failed', e);
        return null;
      } finally {
        setCapturing(false);
      }
    },
    [buildExifNow, captureFlash, settings.mute, tapFocus, maybeCompositeSubjectShot, recordShot]
  );

  const runBurst = useCallback(
    async (source: 'manual' | 'auto' = 'manual'): Promise<CaptureSessionShot | null> => {
      const result = await burst.run();
      if (!result) return null;
      tapFocus.releaseLock();
      const additionalExif = buildExifNow();
      // Stamp the same EXIF onto each frame. A ~900ms burst window doesn't
      // meaningfully change heading / GPS, so a single snapshot is honest
      // enough — and far simpler than per-frame embeds.
      await Promise.all(result.uris.map((uri) => embedCaptureMetadata(uri, additionalExif)));
      const idx = result.bestIndex;
      const output = await maybeCompositeSubjectShot(
        { uri: result.uris[idx], width: result.widths[idx], height: result.heights[idx] },
        additionalExif
      );
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
        lensType: result.lensType,
      });
    },
    [burst, tapFocus, maybeCompositeSubjectShot, recordShot, buildExifNow]
  );

  // Run a real exposure bracket (3 frames at clamped [-2, 0, +2] EV) and
  // record the composited HDR result. Used by `runAuto` when the scene
  // analyzer flags a high-DR frame AND the device doesn't support native
  // single-shot HDR.
  const runHdrBracket = useCallback(
    async (source: 'manual' | 'auto'): Promise<CaptureSessionShot | null> => {
      const result = await bracket.run();
      if (!result) return null;
      tapFocus.releaseLock();
      const additionalExif = buildExifNow();
      await embedCaptureMetadata(result.uri, additionalExif);
      const output = await maybeCompositeSubjectShot(
        { uri: result.uri, width: result.width, height: result.height },
        additionalExif
      );
      return recordShot({
        uri: output.uri,
        width: output.width,
        height: output.height,
        // Rule 8: when the bracket fell back to a single mid frame we mark
        // it as 'single', not 'hdr' — telling the preview screen the truth
        // about which shot was actually produced.
        captureMode: result.wasHdr ? 'hdr' : 'single',
        source,
        lensType: result.lensType,
      });
    },
    [bracket, tapFocus, maybeCompositeSubjectShot, recordShot, buildExifNow]
  );

  // Auto mode: route the shot based on the live scene analyzer.
  //   - Scene flags HDR + device has native photo-HDR → single takePhoto
  //     (CameraStage already mounted with `{ photoHDR: true }`, so the single
  //     shot is a true HDR JPEG and we record it as 'hdr').
  //   - Scene flags HDR but the device cannot do native photo-HDR → real
  //     3-frame exposure bracket via `runHdrBracket`.
  //   - Scene looks balanced → plain single shot.
  //
  // Non-wide lens gate: when the active session is the standalone ultra-wide
  // (or telephoto) the cross-lens analyses are off the table — the scene
  // analyzer's histogram is calibrated against the wide reference, and the
  // bracket composite would compare frames whose lens distortion differs
  // from the reference. Force runSingle for non-wide captures; the banner
  // surfaced from runSingle tells the user why analytics is skipped.
  const runAuto = useCallback(
    async (source: 'manual' | 'auto'): Promise<CaptureSessionShot | null> => {
      const lensIsWide = strategic.activeLens === 'wide';
      if (!lensIsWide) {
        return runSingle(source, 'single');
      }
      if (realHdrTargeted) {
        return runSingle(source, 'hdr');
      }
      if (sceneAnalyzer.hdrRecommended) {
        return runHdrBracket(source);
      }
      return runSingle(source, 'single');
    },
    [
      realHdrTargeted,
      sceneAnalyzer.hdrRecommended,
      runSingle,
      runHdrBracket,
      strategic.activeLens,
    ]
  );

  // strategic.isSwitching covers the ~200–400ms session-swap window. Without
  // it the shutter can fire mid-swap and VisionCamera throws
  // `Camera is not active` — the UI looks frozen because the throw kills
  // the takePhoto promise. Cheaper to disable the button than to handle the
  // race on the capture path.
  const anyCapturing =
    capturing || burst.capturing || bracket.capturing || strategic.isSwitching;

  const captureForMode = useCallback(
    (source: 'manual' | 'auto'): Promise<CaptureSessionShot | null> => {
      if (settings.captureMode === 'burst') return runBurst(source);
      if (settings.captureMode === 'auto') return runAuto(source);
      return runSingle(source);
    },
    [settings.captureMode, runBurst, runAuto, runSingle]
  );

  // useAutoCapture watches sensors.score.total + autofocus lock and fires when
  // the user holds the perfect alignment (with AF locked) long enough.
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

  const onShutter = useCallback(async () => {
    autoCapture.cancel();
    if (anyCapturing || !cameraRef.current || !cameraIsReady) return;
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

  const onAutoCapture = useCallback(async () => {
    if (anyCapturing || !cameraRef.current || !cameraIsReady) return;
    if (settings.countdownSeconds > 0) {
      const completed = await countdown.start(settings.countdownSeconds);
      if (!completed) return;
    }
    const shot = await captureForMode('auto');
    if (!shot) return;
    hapticsBridge.success();
    setHud({ autoCaptureToast: { sessionCount: getCaptureSessionShots().length } });
  }, [anyCapturing, cameraIsReady, settings.countdownSeconds, countdown, captureForMode, setHud]);

  useEffect(() => {
    onAutoFireRef.current = () => {
      void onAutoCapture();
    };
  }, [onAutoCapture]);

  const onShutterLongPress = useCallback(async () => {
    autoCapture.cancel();
    if (anyCapturing || !cameraRef.current || !cameraIsReady) return;
    const shot = await runBurst('manual');
    if (!shot) return;
    navigateToPreview(shot);
  }, [autoCapture, anyCapturing, cameraIsReady, runBurst, navigateToPreview]);

  const ensurePhotoLibraryPermission = useCallback(async (): Promise<boolean> => {
    const current = await ImagePicker.getMediaLibraryPermissionsAsync();
    if (current.granted) return true;
    if (current.canAskAgain) {
      const next = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (next.granted) return true;
    }
    Alert.alert('Photo access needed', 'Allow photo library access to score an existing image.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Open Settings', onPress: () => Linking.openSettings().catch(() => undefined) },
    ]);
    return false;
  }, []);

  const handlePickLibraryImage = useCallback(async () => {
    autoCapture.cancel();
    if (anyCapturing) return;

    const granted = await ensurePhotoLibraryPermission();
    if (!granted) return;

    setCapturing(true);
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        quality: 1,
        exif: true,
      });
      if (result.canceled || !result.assets?.length) return;

      const asset = result.assets[0];
      const uri = await copyImportedCapture(asset);
      const userLocation =
        sensors.userLocation ?? (await locationService.getCurrentLocation().catch(() => null));
      const shot = buildLibraryCaptureSessionShot({
        asset: {
          uri,
          width: asset.width,
          height: asset.height,
        },
        createdAt: Date.now(),
        userLocation,
        heading: sensors.heading,
        distanceMeters: sensors.score.distanceMeters,
        headingDeltaDeg: sensors.score.headingDeltaDeg,
        tilt: sensors.tilt,
      });
      captureSession.addShot(shot);
      hapticsBridge.success();
      navigateToPreview(shot);
    } catch (err) {
      console.warn('[camera] library import failed', err);
      hapticsBridge.error();
      Alert.alert('Could not import photo', 'Please try another image from your library.');
    } finally {
      setCapturing(false);
    }
  }, [
    autoCapture,
    anyCapturing,
    ensurePhotoLibraryPermission,
    sensors.userLocation,
    sensors.heading,
    sensors.score.distanceMeters,
    sensors.score.headingDeltaDeg,
    sensors.tilt,
    captureSession,
    navigateToPreview,
  ]);

  // Permission UI — `status === 'not-determined'` is the brief initial state
  // before the platform answers; treat it as "still loading" instead of
  // jumping straight into the denied CTA.
  if (status === 'not-determined' && !hasPermission) {
    return <View style={[styles.permRoot, { backgroundColor: theme.background.primary }]} />;
  }

  if (!hasPermission) {
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
                if (canRequestPermission) void requestPermission();
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
                {canRequestPermission ? 'Grant access' : 'Open Settings'}
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

  // Android edge-to-edge can report insets.bottom as 0 even when the gesture
  // navigation bar (海帶條) is drawn over the window — floor it so the shutter
  // row + HUD layers always clear the system bar. iOS insets are used as-is.
  const cameraBottomInset = resolveCameraBottomInset(insets.bottom, Platform.OS);
  const safeAreaBottomPad = bottomPad({ bottom: cameraBottomInset });
  const bottomBarHeight = safeAreaBottomPad + CAMERA_BOTTOM_BAR_CONTENT_HEIGHT;
  const topBarBottom = insets.top + resolveCameraTopChromeHeight({ quickControlsOpen });
  const focusEvBarBottom = isLandscape ? safeAreaBottomPad + 72 : bottomBarHeight + 84;
  const cameraHudVisibility = resolveTransientCameraHudVisibility({
    overlayControlsOpen: overlayDockOpen,
    afLocked: tapFocus.afLocked,
  });
  const handleOpenInfo = () => {
    hapticsBridge.tap();
    router.push({ pathname: '/pilgrimage/compare/align', params: { ...params } });
  };
  // Island chip wires the off-strip lens-switch affordance for
  // standalone-switch cohorts (S20FE / Pixel 8). The chip is null when:
  //   * the cohort is logical (iOS / Xiaomi true-0.5) — strip handles 0.5
  //     continuously, no chip needed; OR
  //   * the cohort is wide-only (Pixel 6a) — no ultra-wide hardware exists.
  //   * the cohort is still null (enumeration in flight) — never lie.
  const dialIsland =
    cohort && cohort.strategy === 'standalone-switch' && cohort.ultraWide
      ? strategic.activeLens === 'wide'
        ? ({ stop: 0.5 as FocalStop, targetLens: 'ultra-wide' as const })
        : ({ stop: 1 as FocalStop, targetLens: 'wide' as const })
      : null;
  const focalDial = (
    <ZoomDial
      zoomShared={zoom.zoomShared}
      activeStop={zoom.activeStop as FocalStop | null}
      themeColor={themeColor}
      availableStops={availableStops}
      isFrontFacing={facing === 'front'}
      stopZoom={STOP_TO_ZOOM}
      maxZoom={maxZoom}
      onPickFocalStop={zoom.setStop}
      island={dialIsland}
      onPickIsland={handleRequestSwitch}
      islandPending={strategic.isSwitching}
    />
  );
  const overlayControls = (
    <OverlayControlsBar
      visible={overlayVisible}
      mode={overlayMode}
      edgeIntensity={edgeIntensity}
      subjectFocus={subjectFocus}
      subjectCombine={subjectCombine}
      opacity={overlayOpacity}
      flipped={overlayTransform.flipped}
      editMode={editMode}
      themeColor={themeColor}
      onSelectOff={() => {
        setHud({ overlayVisible: false, switchToast: { ...OVERLAY_MODE_TOAST.off } });
      }}
      onSelectMode={(m) => {
        setHud({
          overlayMode: m,
          overlayVisible: true,
          switchToast: { ...OVERLAY_MODE_TOAST[m] },
        });
      }}
      onSelectEdgeIntensity={(i) => setHud({ edgeIntensity: i })}
      onSelectSubjectFocus={(f) => setHud({ subjectFocus: f })}
      onToggleSubjectCombine={() => setHud((h) => ({ subjectCombine: !h.subjectCombine }))}
      onChangeOpacity={(o) => setHud({ overlayOpacity: o })}
      onToggleFlip={overlayTransform.toggleFlip}
      onToggleEdit={handleToggleEdit}
    />
  );

  return (
    <GestureHandlerRootView style={styles.root}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.root}>
        <CameraErrorBoundary>
          <CameraStage
            ref={cameraRef}
            facing={facing}
            device={strategic.activeDevice}
            zoomShared={zoom.zoomShared}
            exposureShared={exposureShared}
            preferHdr={realHdrTargeted}
            enableTorch={enableTorch}
            mirrorSelfie={settings.mirror}
            active={cameraActive}
            resolutionTier={settings.resolutionTier}
            aspect={aspect}
            qualityPrioritization={qualityToPrioritization(settings.quality)}
            quality={qualityToNumber(settings.quality)}
            enableShutterSound={!settings.mute}
            pinchGesture={zoom.pinchGesture}
            tapGesture={tapFocus.tapGesture}
            onCameraReady={handleCameraReady}
            onMountError={handleMountError}
            onDeviceInfo={setDeviceInfo}
            showWarmup={!cameraIsReady || strategic.isSwitching}
            freezeFrameUri={freezeFrameUri}
            frameOutput={sceneAnalyzer.frameOutput}
          />
        </CameraErrorBoundary>

        <OverlayLayer
          mode={overlayMode}
          hiResImageUrl={hiResImageUrl}
          winW={winW}
          winH={winH}
          opacity={overlayVisible ? overlayOpacity : 0}
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
          onClose={() => router.back()}
          actions={
            <>
              <CameraHeaderButton
                icon={FLASH_ICON[flashMode]}
                accessibilityLabel={`Flash ${flashMode}`}
                themeColor={themeColor}
                active={flashMode !== 'off'}
                onPress={cycleFlash}
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
                  setHud({ settingsOpen: true });
                }}
              />
            </>
          }
          quickControlsExpanded={quickControlsOpen}
          onToggleQuickControls={() => setHud((h) => ({ quickControlsOpen: !h.quickControlsOpen }))}
          quickControls={
            <>
              <CountdownChip
                seconds={settings.countdownSeconds}
                onChange={(s) => setSettings({ countdownSeconds: s })}
              />
              <AspectChip aspect={aspect} onChange={(a) => setHud({ aspect: a })} />
              <OrientationChip
                mode={orientationMode}
                onChange={(m) => setHud({ orientationMode: m })}
              />
              <CameraChip
                icon="information-circle-outline"
                label="Guide"
                themeColor={themeColor}
                accessibilityLabel="Open framing guide"
                onPress={handleOpenInfo}
              />
            </>
          }
        />

        <View
          pointerEvents="box-none"
          style={[
            styles.refThumbWrap,
            { top: topBarBottom + 8, left: Math.max(14, insets.left + 12) },
          ]}>
          <ReferenceThumbnail
            imageUrl={imageUrl}
            themeColor={themeColor}
            isLandscape={isLandscape}
            onPress={() => setHud({ sceneSwitcherOpen: true })}
          />
        </View>

        {/* Persistent AUTO chip when the user picked auto mode — flips to
            "AUTO · HDR" once the scene analyzer agrees and the camera is
            preparing an HDR shot. Rule 8: this only renders the real live
            recommendation, never a guess. */}
        {settings.captureMode === 'auto' ? (
          <View
            pointerEvents="none"
            style={[
              styles.autoModeBadgeWrap,
              {
                top: topBarBottom + 8,
                right: Math.max(14, insets.right + 12),
              },
            ]}>
            <View
              style={[
                styles.autoModeBadge,
                {
                  borderColor: sceneAnalyzer.hdrRecommended ? themeColor : 'rgba(255,255,255,0.4)',
                  backgroundColor: sceneAnalyzer.hdrRecommended
                    ? themeColor
                    : 'rgba(0,0,0,0.55)',
                },
              ]}>
              <ThemedText
                variant="captionSmall"
                weight="700"
                style={{
                  color: sceneAnalyzer.hdrRecommended ? readableTextOn(themeColor) : '#fff',
                  letterSpacing: 1,
                }}>
                {sceneAnalyzer.hdrRecommended ? 'AUTO · HDR' : 'AUTO'}
              </ThemedText>
            </View>
          </View>
        ) : null}

        <AlignmentHUD
          score={sensors.score}
          themeColor={themeColor}
          topInset={insets.top}
          bottomInset={cameraBottomInset}
          bottomBarHeight={bottomBarHeight}
          rightReserve={isLandscape ? SHUTTER_ROW_LANDSCAPE_WIDTH : 0}
          isLandscape={isLandscape}
          transformed={overlayTransform.transformed}
          rotationDisplayDeg={overlayTransform.rotationDisplayDeg}
          showPerfectBanner={sensors.showPerfectBanner}
          onReset={overlayTransform.resetTransforms}
        />

        <View
          pointerEvents="box-none"
          style={[
            styles.focalDock,
            isLandscape
              ? { left: insets.left + 16, bottom: safeAreaBottomPad + 16 }
              : { left: 0, right: 0, bottom: bottomBarHeight + 12, alignItems: 'center' },
          ]}>
          {focalDial}
        </View>

        {cameraHudVisibility.showFocusExposureBar ? (
          <FocusExposureBar
            value={evValue}
            themeColor={themeColor}
            bottomOffset={focusEvBarBottom}
            isLandscape={isLandscape}
            onChange={(v) => setHud({ evValue: v })}
          />
        ) : null}

        <View
          pointerEvents="none"
          style={[
            styles.autoBadgeWrap,
            isLandscape
              ? { right: SHUTTER_ROW_LANDSCAPE_WIDTH + 12, bottom: safeAreaBottomPad + 80 }
              : { left: 0, right: 0, bottom: bottomBarHeight + 156 },
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
                  right: SHUTTER_ROW_LANDSCAPE_WIDTH + 8,
                  top: topBarBottom + 48,
                  bottom: safeAreaBottomPad + 96,
                  width: 56,
                }
              : {
                  left: 0,
                  right: 0,
                  bottom: bottomBarHeight + 84,
                  height: 60,
                },
            !cameraHudVisibility.showCaptureHistory && styles.hidden,
          ]}>
          <CaptureHistoryStrip
            uris={captureSession.shots.map((s) => s.uri)}
            onSelect={(uri) => {
              const shot = captureSession.shots.find((s) => s.uri === uri);
              if (shot) navigateToPreview(shot);
            }}
            themeColor={themeColor}
            isLandscape={isLandscape}
          />
        </View>

        {/* Portrait: overlay controls bar + shutter row in a fixed bottom panel */}
        {!isLandscape && (
          <View
            style={[
              styles.portraitBottomPanel,
              {
                bottom: safeAreaBottomPad,
                height: CAMERA_BOTTOM_BAR_CONTENT_HEIGHT,
                paddingHorizontal: Math.max(16, insets.left),
              },
            ]}>
            <ShutterRow
              themeColor={themeColor}
              capturing={anyCapturing}
              isLandscape={false}
              animateCapture={settings.animateShutter}
              isFrontFacing={facing === 'front'}
              onShutter={onShutter}
              onLongPress={onShutterLongPress}
              onPickLibrary={handlePickLibraryImage}
              onFlip={toggleFacing}
              burst={
                burst.capturing
                  ? { active: true, captured: burst.captured, total: burst.total }
                  : undefined
              }
            />
          </View>
        )}

        <OverlayDock
          open={overlayDockOpen}
          onToggle={() => setHud((h) => ({ overlayDockOpen: !h.overlayDockOpen }))}
          themeColor={themeColor}
          isLandscape={isLandscape}
          bottomBarHeight={bottomBarHeight}
          bottomPad={safeAreaBottomPad}
          clusterReserve={SHUTTER_ROW_LANDSCAPE_WIDTH}
          leftInset={insets.left}
          rightInset={insets.right}>
          {overlayControls}
        </OverlayDock>

        {isLandscape && (
          <View
            style={[
              styles.landscapeCluster,
              { right: insets.right, top: topBarBottom, bottom: safeAreaBottomPad },
            ]}>
            <ShutterRow
              themeColor={themeColor}
              capturing={anyCapturing}
              isLandscape={true}
              animateCapture={settings.animateShutter}
              isFrontFacing={facing === 'front'}
              onShutter={onShutter}
              onLongPress={onShutterLongPress}
              onPickLibrary={handlePickLibraryImage}
              onFlip={toggleFacing}
              burst={
                burst.capturing
                  ? { active: true, captured: burst.captured, total: burst.total }
                  : undefined
              }
            />
          </View>
        )}

        <View
          pointerEvents="none"
          style={[
            styles.modeToastWrap,
            isLandscape
              ? {
                  left: insets.left + 16,
                  right: SHUTTER_ROW_LANDSCAPE_WIDTH,
                  bottom: safeAreaBottomPad + 24,
                }
              : { left: 0, right: 0, bottom: bottomBarHeight + 156 },
          ]}>
          <CaptureModeToast
            toast={captureModeToast}
            themeColor={themeColor}
            nativeHdrActive={realHdrTargeted}
          />
          <AutoCaptureToast toast={autoCaptureToast} themeColor={themeColor} />
          <CamSwitchToast toast={switchToast} themeColor={themeColor} />
        </View>

        <CountdownOverlay
          remaining={countdown.remaining}
          themeColor={themeColor}
          onCancel={countdown.cancel}
        />

        <CameraSettingsSheet
          visible={settingsOpen}
          onClose={() => setHud({ settingsOpen: false })}
          settings={settings}
          onSettingsChange={setSettings}
          aspect={aspect}
          onAspectChange={(a) => setHud({ aspect: a })}
          captureMode={settings.captureMode}
          onCaptureModeChange={(m) => setSettings({ captureMode: m })}
        />

        <SceneSwitcherSheet
          visible={sceneSwitcherOpen}
          onClose={() => setHud({ sceneSwitcherOpen: false })}
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
  refThumbWrap: { position: 'absolute', zIndex: 66 },
  focalDock: { position: 'absolute', zIndex: 58 },
  autoBadgeWrap: { position: 'absolute', alignItems: 'center', zIndex: 60 },
  autoModeBadgeWrap: { position: 'absolute', zIndex: 66 },
  autoModeBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
    borderWidth: 1,
  },
  modeToastWrap: { position: 'absolute', alignItems: 'center', zIndex: 80 },
  captureHistoryWrap: { position: 'absolute', alignItems: 'center', zIndex: 58 },
  portraitBottomPanel: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 70,
    paddingBottom: 6,
    justifyContent: 'center',
  },
  landscapeCluster: {
    position: 'absolute',
    zIndex: 70,
    width: SHUTTER_ROW_LANDSCAPE_WIDTH,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hidden: { display: 'none' },
  levelHorizonWrap: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
