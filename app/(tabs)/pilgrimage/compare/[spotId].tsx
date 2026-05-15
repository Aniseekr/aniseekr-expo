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
import { applyBrightnessToImage } from '../../../../libs/services/pilgrimage/apply-brightness';
import { buildAdditionalExif } from '../../../../libs/services/pilgrimage/build-exif-metadata';
import { pilgrimageRepository } from '../../../../libs/services/pilgrimage/pilgrimage-repository';
import { getPilgrimageSpotTitles } from '../../../../libs/services/pilgrimage/pilgrimage-localization';
import type { AnitabiPoint } from '../../../../libs/services/pilgrimage/types';
import {
  cameraOrientationLockIntent,
  formatCameraHeader,
  CAMERA_TOOL_MENU_DOCK_BOTTOM_OFFSET,
  resolveCameraToolMenuLayout,
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
import CameraErrorBoundary from '../../../../components/pilgrimage/camera/CameraErrorBoundary';
import CameraStage from '../../../../components/pilgrimage/camera/CameraStage';
import OverlayLayer from '../../../../components/pilgrimage/camera/OverlayLayer';
import { FocusReticle } from '../../../../components/pilgrimage/camera/FocusReticle';
import { LevelHorizon } from '../../../../components/pilgrimage/camera/LevelHorizon';
import FocusExposureBar from '../../../../components/pilgrimage/camera/FocusExposureBar';
import CameraTopBar from '../../../../components/pilgrimage/camera/CameraTopBar';
import AlignmentHUD from '../../../../components/pilgrimage/camera/AlignmentHUD';
import FocalPills from '../../../../components/pilgrimage/camera/FocalPills';
import CameraToolMenu, {
  CameraToolMenuTrigger,
} from '../../../../components/pilgrimage/camera/CameraToolMenu';
import ShutterRow, {
  SHUTTER_ROW_LANDSCAPE_WIDTH,
} from '../../../../components/pilgrimage/camera/ShutterRow';
import OverlayControls from '../../../../components/pilgrimage/camera/chips/OverlayControls';
import FlashChip from '../../../../components/pilgrimage/camera/chips/FlashChip';
import ExposureControls, {
  formatEV,
} from '../../../../components/pilgrimage/camera/chips/ExposureControls';
import AspectChip from '../../../../components/pilgrimage/camera/chips/AspectChip';
import CaptureModeChip from '../../../../components/pilgrimage/camera/chips/CaptureModeChip';
import CountdownChip from '../../../../components/pilgrimage/camera/chips/CountdownChip';
import SettingsChip from '../../../../components/pilgrimage/camera/chips/SettingsChip';
import CameraSettingsSheet from '../../../../components/pilgrimage/camera/CameraSettingsSheet';
import { CountdownOverlay } from '../../../../components/pilgrimage/camera/CountdownOverlay';
import type {
  AspectRatio,
  FlashMode,
  FocalStop,
  OverlayMode,
} from '../../../../components/pilgrimage/camera/types';
import { useCameraZoom } from '../../../../hooks/useCameraZoom';
import { useTapToFocus } from '../../../../hooks/useTapToFocus';
import { useLensSwitcher } from '../../../../hooks/useLensSwitcher';
import { useBrightnessPreview } from '../../../../hooks/useBrightnessPreview';
import { useOverlayTransform } from '../../../../hooks/useOverlayTransform';
import { useAlignmentSensors } from '../../../../hooks/useAlignmentSensors';
import { useEdgeOrSketch } from '../../../../hooks/useEdgeOrSketch';
import { useCameraSettings, qualityToNumber } from '../../../../hooks/useCameraSettings';
import { useCameraLifecycle } from '../../../../hooks/useCameraLifecycle';
import { useBurstCapture } from '../../../../hooks/useBurstCapture';
import { useCaptureCountdown } from '../../../../hooks/useCaptureCountdown';
import { usePseudoHDR } from '../../../../hooks/usePseudoHDR';
import { useAutoCapture } from '../../../../hooks/useAutoCapture';
import { useCaptureHistory } from '../../../../hooks/useCaptureHistory';
import AutoCaptureStatusBadge from '../../../../components/pilgrimage/camera/AutoCaptureBadge';
import CaptureHistoryStrip from '../../../../components/pilgrimage/camera/CaptureHistoryStrip';
import SceneSwitcherSheet from '../../../../components/pilgrimage/camera/SceneSwitcherSheet';

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
  const [overlayOpacity, setOverlayOpacity] = useState(0.5);
  const [editMode, setEditMode] = useState(false);
  const [evValue, setEvValue] = useState(0);
  const [orientationMode, setOrientationMode] = useState<CameraOrientationMode>('auto');
  const [capturing, setCapturing] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [toolMenuOpen, setToolMenuOpen] = useState(false);
  const [appIsForeground, setAppIsForeground] = useState(() => AppState.currentState === 'active');
  const [availablePictureSizes, setAvailablePictureSizes] = useState<string[]>([]);
  const [sceneSwitcherOpen, setSceneSwitcherOpen] = useState(false);
  // null = not yet fetched. Empty array = fetch ran but returned nothing.
  const [availableSpots, setAvailableSpots] = useState<readonly AnitabiPoint[] | null>(null);
  const [spotsLoading, setSpotsLoading] = useState(false);

  const { settings, setSettings } = useCameraSettings();
  const lifecycle = useCameraLifecycle(true);

  const zoom = useCameraZoom({ initial: 1 });
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
  } = lifecycle;
  const brightness = useBrightnessPreview({ value: evValue });
  const overlayTransform = useOverlayTransform({ enabled: editMode });
  const sensors = useAlignmentSensors({ spotLat: params.spotLat, spotLng: params.spotLng });
  const edgeOrSketch = useEdgeOrSketch({ mode: overlayMode, hiResImageUrl, themeColor });

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
  // Session-only history of capture URIs (newest first, max 6). Each
  // run{Single|Burst|Hdr} pushes the visible/best frame so the strip near the
  // shutter reflects what the user just shot.
  const captureHistory = useCaptureHistory();

  // CameraView fires onCameraReady once the native surface is up. We compose
  // three concerns there: (1) flip `isReady` so the warmup spinner clears,
  // (2) re-query physical lenses (the ref is usually null at first render),
  // (3) probe getAvailablePictureSizesAsync so the settings sheet can list
  // real device sizes instead of guessing.
  const handleCameraReady = useCallback(() => {
    onCameraReady();
    void refreshAvailableLenses();
    const cam = cameraRef.current;
    if (cam && typeof cam.getAvailablePictureSizesAsync === 'function') {
      cam
        .getAvailablePictureSizesAsync()
        .then((sizes) => {
          if (Array.isArray(sizes)) setAvailablePictureSizes(sizes);
        })
        .catch(() => undefined);
    }
  }, [onCameraReady, refreshAvailableLenses]);

  // CameraView.flash only accepts 'on'|'off'|'auto'; torch surfaces via enableTorch.
  const enableTorch = flashMode === 'torch';
  const cameraFlash: 'on' | 'off' | 'auto' = flashMode === 'torch' ? 'off' : flashMode;

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
  // different physical lens set per camera) so FocalPills reflect reality.
  useEffect(() => {
    void refreshAvailableLenses();
  }, [facing, refreshAvailableLenses]);

  const toggleFacing = useCallback(() => {
    hapticsBridge.selection();
    setFacing((f) => (f === 'back' ? 'front' : 'back'));
  }, []);

  useEffect(() => {
    return () => {
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(
        () => undefined
      );
    };
  }, []);

  useEffect(() => {
    const lockIntent = cameraOrientationLockIntent(orientationMode);
    const op =
      lockIntent === 'landscape'
        ? ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE)
        : ScreenOrientation.unlockAsync();
    op.catch(() => undefined);
  }, [orientationMode]);

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
      router.replace({
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

  const runSingle = useCallback(async () => {
    if (!cameraRef.current) return;
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
      if (!captured) return;

      const baked = await applyBrightnessToImage({
        inputUri: captured.uri,
        exif: captured.exif,
        colorMatrix: brightness.colorMatrix,
        quality: qualityNum,
      });
      captureHistory.push(baked.uri);
      tapFocus.releaseLock();
      navigateToPreview({
        uri: baked.uri,
        width: baked.width || captured.width,
        height: baked.height || captured.height,
        captureMode: 'single',
      });
    } catch (e) {
      console.warn('[camera] single capture failed', e);
    } finally {
      setCapturing(false);
    }
  }, [
    settings.quality,
    settings.skipProcessing,
    settings.mute,
    brightness.colorMatrix,
    tapFocus,
    captureHistory,
    navigateToPreview,
    spotId,
    name,
    ep,
    animeId,
    animeTitle,
    sensors.userLocation,
    sensors.heading,
    sensors.tilt,
  ]);

  const runBurst = useCallback(async () => {
    const result = await burst.run();
    if (!result) return;
    tapFocus.releaseLock();
    const idx = result.bestIndex;
    captureHistory.push(result.uris[idx]);
    navigateToPreview({
      uri: result.uris[idx],
      width: result.widths[idx],
      height: result.heights[idx],
      captureMode: 'burst',
      burstTotal: result.total,
      burstUris: result.uris,
      burstBestIndex: idx,
    });
  }, [burst, tapFocus, captureHistory, navigateToPreview]);

  const runHdr = useCallback(async () => {
    const result = await hdr.run();
    if (!result) return;
    tapFocus.releaseLock();
    captureHistory.push(result.uri);
    navigateToPreview({
      uri: result.uri,
      width: result.width,
      height: result.height,
      // Rule 8: when compositing fell back to the mid frame we mark it as
      // single, not HDR — telling the preview screen the truth.
      captureMode: result.wasHdr ? 'hdr' : 'single',
    });
  }, [hdr, tapFocus, captureHistory, navigateToPreview]);

  const anyCapturing = capturing || burst.capturing || hdr.capturing;

  // useAutoCapture watches sensors.score.total and fires onShutter when the
  // user holds the perfect alignment long enough. `enabled` is the user
  // setting; `captureBusy` pauses watching while any capture is in-flight
  // OR a countdown is running (so we don't double-fire).
  const AUTO_SUSTAIN_MS = 1500;
  const onShutterRef = useRef<() => void>(() => undefined);
  const autoCapture = useAutoCapture({
    scoreTotal: sensors.score.total,
    enabled: settings.autoCapture,
    captureBusy: anyCapturing || countdown.isRunning,
    sustainMs: AUTO_SUSTAIN_MS,
    onFire: () => {
      onShutterRef.current();
    },
  });

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
    if (settings.captureMode === 'burst') {
      await runBurst();
      return;
    }
    if (settings.captureMode === 'hdr') {
      await runHdr();
      return;
    }
    await runSingle();
  }, [
    autoCapture,
    anyCapturing,
    cameraIsReady,
    settings.countdownSeconds,
    settings.captureMode,
    countdown,
    runBurst,
    runHdr,
    runSingle,
  ]);

  // Keep the ref up to date so useAutoCapture's onFire calls the latest closure.
  useEffect(() => {
    onShutterRef.current = () => {
      void onShutter();
    };
  }, [onShutter]);

  // Long-press the shutter to fire a burst regardless of the current mode —
  // power-user shortcut so the user doesn't have to switch modes mid-shot.
  const onShutterLongPress = useCallback(() => {
    autoCapture.cancel();
    if (anyCapturing || !cameraRef.current || !cameraIsReady) return;
    void runBurst();
  }, [autoCapture, anyCapturing, cameraIsReady, runBurst]);

  const onPickFocalStop = useCallback(
    (stop: FocalStop) => {
      if (hasOpticalZoom) setOpticalStop(stop);
      else zoom.setStop(stop);
    },
    [hasOpticalZoom, setOpticalStop, zoom]
  );

  const toggleLandscapeMode = useCallback(() => {
    hapticsBridge.selection();
    setOrientationMode((mode) => (mode === 'landscape' ? 'auto' : 'landscape'));
  }, []);

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

  const headerText = formatCameraHeader({ sceneName: name, animeTitle, ep });
  const activeFocalStop = hasOpticalZoom
    ? (stopForLens(selectedLens) as FocalStop | null)
    : zoom.activeStop;
  const safeAreaBottomPad = bottomPad(insets);
  const focusEvBarBottom = safeAreaBottomPad + (isLandscape ? 72 : 116);
  const dockBottom = safeAreaBottomPad + (isLandscape ? 70 : 110) + (tapFocus.afLocked ? 68 : 0);
  const toolMenuLayout = resolveCameraToolMenuLayout({
    isLandscape,
    safeAreaBottomPad,
    portraitDockBottom: dockBottom,
    shutterRailWidth: SHUTTER_ROW_LANDSCAPE_WIDTH,
  });
  const cameraHudVisibility = resolveTransientCameraHudVisibility({
    toolMenuOpen,
    afLocked: tapFocus.afLocked,
  });
  const handleOpenInfo = () => {
    hapticsBridge.tap();
    router.push({ pathname: '/pilgrimage/compare/align', params: { ...params } });
  };

  return (
    <GestureHandlerRootView style={styles.root}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.root}>
        <CameraErrorBoundary>
          <CameraStage
            cameraRef={cameraRef}
            facing={facing}
            zoom={zoom.zoom}
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
            pictureSize={settings.pictureSize ?? undefined}
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
          sceneName={headerText.title}
          subtitleText={headerText.subtitle}
          themeColor={themeColor}
          topInset={insets.top}
          leftInset={insets.left}
          rightInset={insets.right}
          onClose={() => router.back()}
          onOpenInfo={handleOpenInfo}
          showActions
          compact
          trailingActions={
            <>
              <Pressable
                onPress={() => {
                  hapticsBridge.selection();
                  setEditMode((v) => !v);
                }}
                hitSlop={14}
                accessibilityRole="button"
                accessibilityState={{ selected: editMode }}
                accessibilityLabel={editMode ? 'Lock overlay' : 'Edit overlay position'}
                style={({ pressed }) => [
                  styles.topBarBtn,
                  {
                    backgroundColor: editMode ? themeColor : 'rgba(0,0,0,0.55)',
                  },
                  pressed && { opacity: 0.7 },
                ]}>
                <Ionicons
                  name={editMode ? 'lock-open' : 'move'}
                  size={18}
                  color={editMode ? readableTextOn(themeColor) : '#fff'}
                />
              </Pressable>
              <Pressable
                onPress={toggleFacing}
                hitSlop={14}
                accessibilityRole="button"
                accessibilityState={{ selected: facing === 'front' }}
                accessibilityLabel={facing === 'front' ? 'Use back camera' : 'Use front camera'}
                style={({ pressed }) => [
                  styles.topBarBtn,
                  {
                    backgroundColor: facing === 'front' ? themeColor : 'rgba(0,0,0,0.55)',
                  },
                  pressed && { opacity: 0.7 },
                ]}>
                <Ionicons
                  name="camera-reverse-outline"
                  size={18}
                  color={facing === 'front' ? readableTextOn(themeColor) : '#fff'}
                />
              </Pressable>
              <Pressable
                onPress={toggleLandscapeMode}
                hitSlop={14}
                accessibilityRole="button"
                accessibilityState={{ selected: orientationMode === 'landscape' }}
                accessibilityLabel={
                  orientationMode === 'landscape' ? 'Return to auto rotation' : 'Use landscape'
                }
                style={({ pressed }) => [
                  styles.topBarBtn,
                  {
                    backgroundColor:
                      orientationMode === 'landscape' ? themeColor : 'rgba(0,0,0,0.55)',
                  },
                  pressed && { opacity: 0.7 },
                ]}>
                <Ionicons
                  name={
                    orientationMode === 'landscape'
                      ? 'phone-portrait-outline'
                      : 'phone-landscape-outline'
                  }
                  size={18}
                  color={orientationMode === 'landscape' ? readableTextOn(themeColor) : '#fff'}
                />
              </Pressable>
            </>
          }
        />

        <AlignmentHUD
          score={sensors.score}
          themeColor={themeColor}
          topInset={insets.top}
          bottomInset={insets.bottom}
          isLandscape={isLandscape}
          transformed={overlayTransform.transformed}
          rotationDisplayDeg={overlayTransform.rotationDisplayDeg}
          showPerfectBanner={sensors.showPerfectBanner}
          onReset={overlayTransform.resetTransforms}
        />

        {/* Dock houses focal pills + capture mode + the "More" trigger in a
            single edge-anchored row (same shape portrait + landscape).
            - Focal pills (left) and capture mode (centre) stay visible all
              the time — they're the two controls the user hits most often.
            - The "More" trigger opens <CameraToolMenu/> (rendered at screen
              root, below) — a drill-down popover for the secondary tools.
            - Action buttons (close/info/edit-overlay/swap/orientation) live
              in the top bar so the bottom strip stays slim. */}
        <View
          style={[
            styles.dock,
            isLandscape
              ? {
                  left: Math.max(16, insets.left),
                  right: SHUTTER_ROW_LANDSCAPE_WIDTH + 16,
                  bottom: safeAreaBottomPad + CAMERA_TOOL_MENU_DOCK_BOTTOM_OFFSET,
                  top: undefined,
                  width: undefined,
                  zIndex: 60,
                }
              : {
                  left: 16,
                  right: 16,
                  bottom: dockBottom,
                  width: undefined,
                  zIndex: 60,
                },
          ]}
          pointerEvents="box-none">
          <FocalPills
            activeStop={activeFocalStop}
            themeColor={themeColor}
            availableStops={hasOpticalZoom ? availableStops : undefined}
            // Keep the OPTICAL caption hidden — the row sits flat in both
            // portrait and landscape now, and the extra vertical line would
            // misalign the row across the bar.
            opticalHint={false}
            isFrontFacing={facing === 'front'}
            onPick={onPickFocalStop}
            virtualLenses={virtualLenses}
            virtualActive={isVirtualLensActive}
            onPickVirtual={() => {
              const pick = pickAutoVirtualLens(availableLenses);
              if (pick) setVirtualLens(pick);
            }}
          />
          <CaptureModeChip
            mode={settings.captureMode}
            onChange={(m) => setSettings({ captureMode: m })}
          />
          <CameraToolMenuTrigger
            themeColor={themeColor}
            expanded={toolMenuOpen}
            onPress={() => setToolMenuOpen((v) => !v)}
          />
        </View>

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
              ? // Sit above the chip strip (chips occupy ~58px from the bottom inset).
                { right: SHUTTER_ROW_LANDSCAPE_WIDTH + 12, bottom: safeAreaBottomPad + 80 }
              : { left: 0, right: 0, bottom: safeAreaBottomPad + 180 },
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
                  bottom: safeAreaBottomPad + 220,
                  height: 60,
                },
            !cameraHudVisibility.showCaptureHistory && styles.hidden,
          ]}>
          <CaptureHistoryStrip
            uris={captureHistory.history}
            onSelect={(uri) =>
              navigateToPreview({
                uri,
                width: 0,
                height: 0,
                captureMode: 'single',
              })
            }
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
          bottomInset={insets.bottom}
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

        {/* Drill-down popover for the secondary camera tools. Rendered at
            screen root (after ShutterRow) so it floats above every HUD layer
            and is reliably touchable — see CameraToolMenu for the rationale. */}
        <CameraToolMenu
          visible={toolMenuOpen}
          onRequestClose={() => setToolMenuOpen(false)}
          themeColor={themeColor}
          bottomOffset={toolMenuLayout.bottomOffset}
          rightOffset={toolMenuLayout.rightOffset}
          topInset={insets.top}
          cycleChips={
            <>
              <CountdownChip
                seconds={settings.countdownSeconds}
                onChange={(s) => setSettings({ countdownSeconds: s })}
              />
              <FlashChip
                flashMode={flashMode}
                isFrontFacing={facing === 'front'}
                onChange={setFlashMode}
              />
              <AspectChip aspect={aspect} onChange={setAspect} />
              <SettingsChip
                onPress={() => {
                  setToolMenuOpen(false);
                  setSettingsOpen(true);
                }}
              />
            </>
          }
          overlaySummary={`${Math.round(overlayOpacity * 100)}%`}
          overlayControls={
            <OverlayControls
              mode={overlayMode}
              opacity={overlayOpacity}
              flipped={overlayTransform.flipped}
              themeColor={themeColor}
              onSelectMode={setOverlayMode}
              onChangeOpacity={setOverlayOpacity}
              onToggleFlip={overlayTransform.toggleFlip}
            />
          }
          exposureSummary={tapFocus.afLocked ? null : formatEV(evValue)}
          exposureControls={<ExposureControls value={evValue} onChange={setEvValue} />}
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
          availablePictureSizes={availablePictureSizes}
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
  dock: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    overflow: 'visible',
  },
  autoBadgeWrap: { position: 'absolute', alignItems: 'center' },
  captureHistoryWrap: { position: 'absolute', alignItems: 'center' },
  hidden: { display: 'none' },
  levelHorizonWrap: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Compact top-bar action button. Matches CameraTopBar's internal topBtn
  // dimensions so the trailing actions (edit / swap / orientation) slot in
  // cleanly next to the info icon.
  topBarBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
