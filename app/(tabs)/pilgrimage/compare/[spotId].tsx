import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated as RNAnimated,
  Linking,
  Pressable,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { CameraView, useCameraPermissions, type CameraType } from 'expo-camera';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import Slider from '@react-native-community/slider';
import Ionicons from '@expo/vector-icons/Ionicons';
import { DeviceMotion, Magnetometer } from 'expo-sensors';
import * as ScreenOrientation from 'expo-screen-orientation';
import { GestureDetector, Gesture, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { Canvas, Image as SkiaImage } from '@shopify/react-native-skia';
import { useTheme, type ThemePalette } from '../../../../context/ThemeContext';
import { hapticsBridge } from '../../../../modules/haptics/hapticsBridge';
import { ThemedText, readableTextOn } from '../../../../components/themed';
import {
  locationService,
  type LatLng,
} from '../../../../libs/services/pilgrimage/location-service';
import {
  computeAlignmentScore,
  type AlignmentSensors,
} from '../../../../libs/services/pilgrimage/alignment-scoring';
import { useEdgeImage, useSketchImage } from '../../../../libs/services/pilgrimage/edge-image-skia';

type SearchParams = {
  spotId: string;
  imageUrl: string;
  name: string;
  ep: string;
  animeId: string;
  animeTitle?: string;
  themeColor: string;
  spotLat: string;
  spotLng: string;
};

type OverlayMode = 'anime' | 'sketch' | 'edge';

function bearingBetween(from: LatLng, to: LatLng): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const toDeg = (r: number) => (r * 180) / Math.PI;
  const phi1 = toRad(from.latitude);
  const phi2 = toRad(to.latitude);
  const dLambda = toRad(to.longitude - from.longitude);
  const y = Math.sin(dLambda) * Math.cos(phi2);
  const x = Math.cos(phi1) * Math.sin(phi2) - Math.sin(phi1) * Math.cos(phi2) * Math.cos(dLambda);
  const theta = Math.atan2(y, x);
  return (toDeg(theta) + 360) % 360;
}

function compassPoint(deg: number): string {
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  const idx = Math.round((((deg % 360) + 360) % 360) / 45) % 8;
  return dirs[idx] ?? 'N';
}

export default function CompareCaptureScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const params = useLocalSearchParams<SearchParams>();
  const spotId = params.spotId ?? '';
  const imageUrl = params.imageUrl ?? '';
  const sceneName = params.name ?? 'Scene';
  const ep = params.ep;
  const animeId = params.animeId;
  const animeTitle = params.animeTitle ?? '';
  const themeColor = params.themeColor || theme.accent;
  const spotLatParam = params.spotLat;
  const spotLngParam = params.spotLng;

  const { width: winW, height: winH } = useWindowDimensions();
  const isLandscape = winW > winH;

  const targetLocation = useMemo<LatLng | null>(() => {
    const lat = Number(spotLatParam);
    const lng = Number(spotLngParam);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return { latitude: lat, longitude: lng };
  }, [spotLatParam, spotLngParam]);

  const cameraRef = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();

  const [facing, setFacing] = useState<CameraType>('back');
  const [opacity, setOpacity] = useState(0.4);
  const [grid, setGrid] = useState(true);
  const [heading, setHeading] = useState<number | null>(null);
  const [tilt, setTilt] = useState<number | null>(null);
  const [capturing, setCapturing] = useState(false);
  const [userLocation, setUserLocation] = useState<LatLng | null>(null);
  const [overlayMode, setOverlayMode] = useState<OverlayMode>('anime');
  const [flipped, setFlipped] = useState(false);
  const [transformed, setTransformed] = useState(false);
  const [lockedAt, setLockedAt] = useState<number | null>(null);
  const [perfectFiredAt, setPerfectFiredAt] = useState<number | null>(null);
  const [showPerfectBanner, setShowPerfectBanner] = useState(false);
  const [hintDismissed, setHintDismissed] = useState(false);
  const [portraitLocked, setPortraitLocked] = useState(false);
  const perfectOpacity = useRef(new RNAnimated.Value(0)).current;
  const hintOpacity = useRef(new RNAnimated.Value(1)).current;
  const [hintIconLandscape, setHintIconLandscape] = useState(false);

  // Overlay gesture transforms.
  const scale = useSharedValue(1);
  const baseScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const baseTranslateX = useSharedValue(0);
  const baseTranslateY = useSharedValue(0);
  const rotation = useSharedValue(0);
  const baseRotation = useSharedValue(0);
  const flipScale = useSharedValue(1);

  useEffect(() => {
    if (!permission) return;
    if (!permission.granted && permission.canAskAgain) {
      requestPermission().catch(() => undefined);
    }
  }, [permission, requestPermission]);

  // Allow auto-rotation on this screen so the user can frame in landscape;
  // restore the app-wide portrait lock on unmount.
  useEffect(() => {
    ScreenOrientation.unlockAsync().catch(() => undefined);
    return () => {
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(
        () => undefined
      );
    };
  }, []);

  useEffect(() => {
    if (portraitLocked) {
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(
        () => undefined
      );
    } else {
      ScreenOrientation.unlockAsync().catch(() => undefined);
    }
  }, [portraitLocked]);

  useEffect(() => {
    let cancelled = false;
    locationService
      .getCurrentLocation()
      .then((loc) => {
        if (!cancelled && loc) setUserLocation(loc);
      })
      .catch(() => undefined);

    const unsubscribe = locationService.subscribeToUpdates(
      (loc) => {
        if (!cancelled) setUserLocation(loc);
      },
      { distanceIntervalMeters: 5, timeIntervalMs: 3000 }
    );
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    let magSub: { remove: () => void } | null = null;
    let motionSub: { remove: () => void } | null = null;
    Magnetometer.setUpdateInterval(200);
    magSub = Magnetometer.addListener((data) => {
      const angle = Math.atan2(data.y, data.x);
      let deg = (angle * 180) / Math.PI;
      deg = (90 - deg + 360) % 360;
      setHeading(deg);
    });
    DeviceMotion.setUpdateInterval(200);
    DeviceMotion.isAvailableAsync()
      .then((ok) => {
        if (!ok) return;
        motionSub = DeviceMotion.addListener((data) => {
          const pitch = data.rotation?.beta ?? 0;
          const deg = (pitch * 180) / Math.PI;
          setTilt(deg);
        });
      })
      .catch(() => undefined);
    return () => {
      magSub?.remove();
      motionSub?.remove();
    };
  }, []);

  const targetBearing = useMemo<number | null>(() => {
    if (!userLocation || !targetLocation) return null;
    return bearingBetween(userLocation, targetLocation);
  }, [userLocation, targetLocation]);

  const sensors = useMemo<AlignmentSensors>(
    () => ({ userLocation, targetLocation, heading, targetBearing, tilt }),
    [userLocation, targetLocation, heading, targetBearing, tilt]
  );

  const score = useMemo(() => computeAlignmentScore(sensors), [sensors]);

  // Hysteresis: lock at >=0.9, only release below 0.85 to avoid flapping.
  useEffect(() => {
    const total = score.total;
    if (total == null) {
      if (lockedAt !== null) setLockedAt(null);
      return;
    }
    if (total >= 0.9 && lockedAt === null) {
      setLockedAt(Date.now());
    } else if (total < 0.85 && lockedAt !== null) {
      setLockedAt(null);
    }
  }, [score.total, lockedAt]);

  useEffect(() => {
    if (lockedAt === null) return;
    if (perfectFiredAt !== null && perfectFiredAt >= lockedAt) return;
    const elapsed = Date.now() - lockedAt;
    const delay = Math.max(0, 800 - elapsed);
    const timer = setTimeout(() => {
      if (lockedAt === null) return;
      hapticsBridge.success();
      setPerfectFiredAt(Date.now());
      setShowPerfectBanner(true);
      RNAnimated.timing(perfectOpacity, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }).start();
      setTimeout(() => {
        RNAnimated.timing(perfectOpacity, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }).start(() => setShowPerfectBanner(false));
      }, 1600);
    }, delay);
    return () => clearTimeout(timer);
  }, [lockedAt, perfectFiredAt, perfectOpacity]);

  const { edgeImage, loading: edgeLoading } = useEdgeImage(
    overlayMode === 'edge' ? imageUrl : null,
    { inkColor: themeColor, inkOpacity: 1 }
  );
  const { sketchImage, loading: sketchLoading } = useSketchImage(
    overlayMode === 'sketch' ? imageUrl : null,
    { inkColor: '#1A1A1A', inkOpacity: 1 }
  );

  useEffect(() => {
    if (isLandscape) setHintDismissed(true);
  }, [isLandscape]);

  useEffect(() => {
    if (hintDismissed || isLandscape) return;
    const timer = setTimeout(() => {
      RNAnimated.timing(hintOpacity, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }).start(() => setHintDismissed(true));
    }, 5000);
    return () => clearTimeout(timer);
  }, [hintDismissed, isLandscape, hintOpacity]);

  useEffect(() => {
    if (hintDismissed || isLandscape) return;
    const t = setInterval(() => setHintIconLandscape((v) => !v), 800);
    return () => clearInterval(t);
  }, [hintDismissed, isLandscape]);

  // Gesture composition: pinch + pan + two-finger rotate. Flip is a button toggle.
  const markTransformed = useCallback(() => {
    setTransformed(true);
  }, []);

  const pinch = useMemo(
    () =>
      Gesture.Pinch()
        .onStart(() => {
          baseScale.value = scale.value;
        })
        .onUpdate((e) => {
          const next = baseScale.value * e.scale;
          scale.value = Math.max(0.25, Math.min(4, next));
        })
        .onEnd(() => {
          if (Math.abs(scale.value - 1) > 0.01) runOnJS(markTransformed)();
        }),
    [scale, baseScale, markTransformed]
  );

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .minDistance(4)
        .onStart(() => {
          baseTranslateX.value = translateX.value;
          baseTranslateY.value = translateY.value;
        })
        .onUpdate((e) => {
          translateX.value = baseTranslateX.value + e.translationX;
          translateY.value = baseTranslateY.value + e.translationY;
        })
        .onEnd(() => {
          if (Math.abs(translateX.value) > 1 || Math.abs(translateY.value) > 1) {
            runOnJS(markTransformed)();
          }
        }),
    [translateX, translateY, baseTranslateX, baseTranslateY, markTransformed]
  );

  const rotate = useMemo(
    () =>
      Gesture.Rotation()
        .onStart(() => {
          baseRotation.value = rotation.value;
        })
        .onUpdate((e) => {
          rotation.value = baseRotation.value + e.rotation;
        })
        .onEnd(() => {
          if (Math.abs(rotation.value) > 0.005) runOnJS(markTransformed)();
        }),
    [rotation, baseRotation, markTransformed]
  );

  const composedGesture = useMemo(
    () => Gesture.Simultaneous(pinch, pan, rotate),
    [pinch, pan, rotate]
  );

  const overlayStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
      { rotate: `${rotation.value}rad` },
      { scaleX: flipScale.value },
    ],
  }));

  const [rotationDisplay, setRotationDisplay] = useState<number>(0);
  useEffect(() => {
    const id = setInterval(() => {
      const deg = Math.round((rotation.value * 180) / Math.PI);
      setRotationDisplay((prev) => (prev === deg ? prev : deg));
    }, 80);
    return () => clearInterval(id);
  }, [rotation]);

  const resetTransforms = useCallback(() => {
    hapticsBridge.tap();
    scale.value = withSpring(1);
    translateX.value = withSpring(0);
    translateY.value = withSpring(0);
    rotation.value = withSpring(0);
    flipScale.value = withSpring(1);
    setFlipped(false);
    setTransformed(false);
  }, [scale, translateX, translateY, rotation, flipScale]);

  const toggleFlip = useCallback(() => {
    hapticsBridge.selection();
    const next = !flipped;
    setFlipped(next);
    flipScale.value = withSpring(next ? -1 : 1);
    markTransformed();
  }, [flipped, flipScale, markTransformed]);

  const handleShutter = useCallback(async () => {
    if (!cameraRef.current || capturing) return;
    setCapturing(true);
    hapticsBridge.success();
    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.92,
        skipProcessing: false,
      });
      if (!photo?.uri) {
        setCapturing(false);
        return;
      }
      const headingValue = heading != null ? heading.toFixed(0) : '';
      const snapshot = {
        distanceMeters: score.distanceMeters,
        headingDeltaDeg: score.headingDeltaDeg,
        tilt,
      };
      router.replace({
        pathname: '/pilgrimage/compare/preview',
        params: {
          spotId,
          imageUrl,
          shotUri: photo.uri,
          shotWidth: String(photo.width ?? 0),
          shotHeight: String(photo.height ?? 0),
          name: sceneName,
          ep: ep ?? '',
          animeId: animeId ?? '',
          themeColor,
          heading: headingValue,
          spotLat: spotLatParam ?? '',
          spotLng: spotLngParam ?? '',
          distanceMeters: snapshot.distanceMeters != null ? String(snapshot.distanceMeters) : '',
          headingDeltaDeg: snapshot.headingDeltaDeg != null ? String(snapshot.headingDeltaDeg) : '',
          tilt: snapshot.tilt != null ? String(snapshot.tilt) : '',
        },
      });
    } catch (err) {
      console.warn('shutter failed', err);
      setCapturing(false);
    }
  }, [
    capturing,
    heading,
    imageUrl,
    sceneName,
    ep,
    animeId,
    router,
    spotId,
    themeColor,
    score.distanceMeters,
    score.headingDeltaDeg,
    spotLatParam,
    spotLngParam,
    tilt,
  ]);

  const selectMode = useCallback((mode: OverlayMode) => {
    hapticsBridge.selection();
    setOverlayMode(mode);
  }, []);

  const dismissHint = useCallback(() => {
    hapticsBridge.tap();
    RNAnimated.timing(hintOpacity, {
      toValue: 0,
      duration: 200,
      useNativeDriver: true,
    }).start(() => setHintDismissed(true));
  }, [hintOpacity]);

  const toggleFacing = useCallback(() => {
    hapticsBridge.selection();
    setFacing((prev) => (prev === 'back' ? 'front' : 'back'));
  }, []);

  const toggleGrid = useCallback(() => {
    hapticsBridge.tap();
    setGrid((g) => !g);
  }, []);

  const togglePortraitLock = useCallback(() => {
    hapticsBridge.selection();
    setPortraitLocked((v) => !v);
    setHintDismissed(true);
  }, []);

  const openInfo = useCallback(() => {
    hapticsBridge.tap();
    router.push({
      pathname: '/pilgrimage/compare/align',
      params: { ...params },
    });
  }, [router, params]);

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
                if (permission.canAskAgain) {
                  void requestPermission();
                } else {
                  Linking.openSettings().catch(() => undefined);
                }
              }}
              style={({ pressed }) => [
                styles.permBtn,
                { backgroundColor: themeColor, opacity: pressed ? 0.85 : 1 },
              ]}>
              <ThemedText
                variant="titleSmall"
                weight="700"
                style={{ color: readableTextOn(themeColor) }}>
                {permission.canAskAgain ? 'Grant access' : '前往設定 · Open Settings'}
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

  const totalPct = score.total !== null ? Math.round(score.total * 100) : null;
  const headingDir = heading !== null ? compassPoint(heading) : null;
  const headingDeg = heading !== null ? Math.round(heading) : null;
  const headingDelta = score.headingDeltaDeg;
  const headingAligned = headingDelta !== null && Math.abs(headingDelta) <= 8;
  const subtitleText = animeTitle ? `${animeTitle} 場景` : ep ? `EP ${ep} · 場景` : '場景';
  const showRotationBadge = Math.abs(rotationDisplay) >= 2;

  return (
    <GestureHandlerRootView style={styles.root}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.root}>
        <CameraView
          ref={cameraRef}
          style={StyleSheet.absoluteFill}
          facing={facing}
          responsiveOrientationWhenOrientationLocked
        />

        {grid ? <RuleOfThirdsGrid /> : null}

        <GestureDetector gesture={composedGesture}>
          <Animated.View style={[styles.overlayWrap, overlayStyle]} pointerEvents="auto">
            {overlayMode === 'anime' ? (
              <Image
                source={{ uri: imageUrl }}
                style={[styles.overlayImage, { opacity }]}
                contentFit="contain"
                transition={120}
              />
            ) : overlayMode === 'sketch' ? (
              <Canvas style={[styles.overlayImage, { opacity }]}>
                {sketchImage ? (
                  <SkiaImage
                    image={sketchImage}
                    x={0}
                    y={0}
                    width={winW}
                    height={winH}
                    fit="contain"
                  />
                ) : null}
              </Canvas>
            ) : (
              <Canvas style={[styles.overlayImage, { opacity }]}>
                {edgeImage ? (
                  <SkiaImage
                    image={edgeImage}
                    x={0}
                    y={0}
                    width={winW}
                    height={winH}
                    fit="contain"
                  />
                ) : null}
              </Canvas>
            )}
            {(overlayMode === 'edge' && edgeLoading) ||
            (overlayMode === 'sketch' && sketchLoading) ? (
              <View style={styles.edgeLoader} pointerEvents="none">
                <ActivityIndicator size="small" color="#fff" />
              </View>
            ) : null}
          </Animated.View>
        </GestureDetector>

        <CornerBrackets color={themeColor} insets={insets} />

        <LinearGradient
          colors={['rgba(0,0,0,0.78)', 'rgba(0,0,0,0)']}
          style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
          <Pressable
            onPress={() => router.back()}
            hitSlop={14}
            style={({ pressed }) => [styles.topBtn, pressed && { opacity: 0.6 }]}
            accessibilityRole="button"
            accessibilityLabel="Close camera">
            <Ionicons name="close" size={22} color="#fff" />
          </Pressable>
          <View style={styles.topMid}>
            <ThemedText
              variant="titleSmall"
              weight="700"
              align="center"
              style={{ color: '#fff' }}
              numberOfLines={1}>
              {sceneName}
            </ThemedText>
            <ThemedText
              variant="captionSmall"
              weight="700"
              align="center"
              style={{ color: themeColor }}
              numberOfLines={1}>
              {subtitleText}
            </ThemedText>
          </View>
          <Pressable
            onPress={openInfo}
            hitSlop={14}
            style={({ pressed }) => [styles.topBtn, pressed && { opacity: 0.6 }]}
            accessibilityRole="button"
            accessibilityLabel="Open framing tips">
            <Ionicons name="information-circle-outline" size={22} color="#fff" />
          </Pressable>
        </LinearGradient>

        <View style={[styles.liveBadgeWrap, { top: insets.top + 64 }]}>
          <View style={styles.liveBadge}>
            <View style={styles.liveDot} />
            <ThemedText
              variant="captionSmall"
              weight="700"
              style={{ color: '#fff', letterSpacing: 1 }}>
              LIVE
            </ThemedText>
          </View>
        </View>

        {showRotationBadge ? (
          <View style={[styles.rotationBadge, { top: insets.top + 64, borderColor: themeColor }]}
            pointerEvents="none">
            <Ionicons name="sync" size={12} color={themeColor} />
            <ThemedText variant="captionSmall" weight="700" style={{ color: '#fff' }}>
              {`${rotationDisplay > 0 ? '+' : ''}${rotationDisplay}°`}
            </ThemedText>
          </View>
        ) : null}

        {transformed ? (
          <Pressable
            onPress={resetTransforms}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Reset overlay position"
            style={({ pressed }) => [
              styles.resetChip,
              { top: insets.top + 64, opacity: pressed ? 0.7 : 1 },
            ]}>
            <Ionicons name="refresh" size={14} color="#fff" />
            <ThemedText variant="captionSmall" weight="700" style={{ color: '#fff' }}>
              復原
            </ThemedText>
          </Pressable>
        ) : null}

        <RightControlPanel
          insets={insets}
          theme={theme}
          themeColor={themeColor}
          opacity={opacity}
          setOpacity={setOpacity}
          overlayMode={overlayMode}
          onSelectMode={selectMode}
          flipped={flipped}
          onToggleFlip={toggleFlip}
        />

        <InfoPill
          distanceMeters={score.distanceMeters}
          headingDir={headingDir}
          headingDeg={headingDeg}
          headingAligned={headingAligned}
          tilt={tilt}
          theme={theme}
          themeColor={themeColor}
          bottom={insets.bottom + 196}
        />

        {totalPct !== null ? (
          <View
            style={[styles.alignmentChipWrap, { bottom: insets.bottom + 156 }]}
            pointerEvents="none">
            <View
              style={[
                styles.alignmentChip,
                {
                  borderColor: themeColor,
                  backgroundColor: 'rgba(0,0,0,0.55)',
                },
              ]}>
              <Ionicons name="star" size={12} color={themeColor} />
              <ThemedText
                variant="captionSmall"
                weight="700"
                style={{ color: themeColor, letterSpacing: 0.5 }}>
                對齊度 {totalPct}%
              </ThemedText>
              {totalPct >= 90 ? (
                <>
                  <View style={[styles.chipDot, { backgroundColor: themeColor }]} />
                  <ThemedText
                    variant="captionSmall"
                    weight="700"
                    style={{ color: theme.status.success }}>
                    完美時刻
                  </ThemedText>
                </>
              ) : null}
            </View>
          </View>
        ) : null}

        <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 12 }]}>
          <LinearGradient
            colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.78)']}
            style={StyleSheet.absoluteFill}
          />
          <View style={styles.bottomRow}>
            <ThumbnailBtn
              kind="map"
              themeColor={themeColor}
              onPress={() => {
                hapticsBridge.tap();
                router.push({
                  pathname: '/pilgrimage/compare/align',
                  params: { ...params },
                });
              }}
            />

            <View style={styles.shutterColumn}>
              <Pressable
                onPress={handleShutter}
                disabled={capturing}
                accessibilityRole="button"
                accessibilityLabel="Take comparison photo"
                style={({ pressed }) => [
                  styles.shutterOuter,
                  { borderColor: themeColor },
                  pressed && { opacity: 0.85 },
                  capturing && { opacity: 0.6 },
                ]}>
                <View style={[styles.shutterInner, { backgroundColor: themeColor }]} />
              </Pressable>
              <ThemedText
                variant="captionSmall"
                weight="700"
                align="center"
                style={{ color: 'rgba(255,255,255,0.6)', marginTop: 6, letterSpacing: 1 }}>
                PHOTO
              </ThemedText>
            </View>

            <ThumbnailBtn
              kind="reference"
              themeColor={themeColor}
              imageUrl={imageUrl}
              onPress={() => {
                hapticsBridge.tap();
                selectMode('anime');
              }}
            />
          </View>

          <View style={styles.bottomActionRow}>
            <Pressable
              onPress={toggleGrid}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Toggle rule-of-thirds grid"
              style={({ pressed }) => [
                styles.miniBtn,
                {
                  backgroundColor: grid ? themeColor + '33' : 'rgba(255,255,255,0.12)',
                  borderColor: grid ? themeColor : 'rgba(255,255,255,0.22)',
                  opacity: pressed ? 0.7 : 1,
                },
              ]}>
              <Ionicons
                name={grid ? 'grid' : 'grid-outline'}
                size={16}
                color={grid ? themeColor : '#fff'}
              />
            </Pressable>
            <Pressable
              onPress={toggleFacing}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Switch front/back camera"
              style={({ pressed }) => [
                styles.miniBtn,
                {
                  backgroundColor: 'rgba(255,255,255,0.12)',
                  borderColor: 'rgba(255,255,255,0.22)',
                  opacity: pressed ? 0.7 : 1,
                },
              ]}>
              <Ionicons name="camera-reverse-outline" size={16} color="#fff" />
            </Pressable>
            <Pressable
              onPress={togglePortraitLock}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityState={{ selected: portraitLocked }}
              accessibilityLabel={
                portraitLocked ? 'Allow rotation' : 'Lock portrait orientation'
              }
              style={({ pressed }) => [
                styles.miniBtn,
                {
                  backgroundColor: portraitLocked
                    ? themeColor + '33'
                    : 'rgba(255,255,255,0.12)',
                  borderColor: portraitLocked ? themeColor : 'rgba(255,255,255,0.22)',
                  opacity: pressed ? 0.7 : 1,
                },
              ]}>
              <Ionicons
                name={portraitLocked ? 'lock-closed' : 'lock-open-outline'}
                size={16}
                color={portraitLocked ? themeColor : '#fff'}
              />
            </Pressable>
          </View>
        </View>

        {showPerfectBanner ? (
          <RNAnimated.View
            pointerEvents="none"
            style={[
              styles.perfectBanner,
              {
                bottom: insets.bottom + 232,
                backgroundColor: theme.status.success,
                opacity: perfectOpacity,
              },
            ]}>
            <Ionicons name="checkmark-circle" size={18} color="#fff" />
            <ThemedText variant="bodySmall" weight="700" style={{ color: '#fff' }}>
              完美時刻 · Perfect alignment
            </ThemedText>
          </RNAnimated.View>
        ) : null}

        {!isLandscape && !hintDismissed && !portraitLocked ? (
          <RNAnimated.View
            style={[styles.rotateHintWrap, { opacity: hintOpacity }]}
            pointerEvents="box-none">
            <Pressable
              onPress={dismissHint}
              accessibilityRole="button"
              accessibilityLabel="Dismiss rotate hint"
              style={({ pressed }) => [styles.rotateHint, pressed && { opacity: 0.85 }]}>
              <Ionicons
                name={hintIconLandscape ? 'phone-landscape-outline' : 'phone-portrait-outline'}
                size={18}
                color="#fff"
              />
              <ThemedText variant="captionSmall" weight="700" style={{ color: '#fff' }}>
                請旋轉手機 · Rotate for 16:9 framing
              </ThemedText>
            </Pressable>
          </RNAnimated.View>
        ) : null}
      </View>
    </GestureHandlerRootView>
  );
}

function CornerBrackets({
  color,
  insets,
}: {
  color: string;
  insets: { top: number; bottom: number; left: number; right: number };
}) {
  // Inset matches the visible camera framing the user is meant to align to.
  const T = insets.top + 100;
  const B = insets.bottom + 240;
  const L = 18;
  const R = 18 + 76; // leave room for the right panel
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <View style={[styles.bracket, styles.bracketTL, { top: T, left: L, borderColor: color }]} />
      <View style={[styles.bracket, styles.bracketTR, { top: T, right: R, borderColor: color }]} />
      <View
        style={[styles.bracket, styles.bracketBL, { bottom: B, left: L, borderColor: color }]}
      />
      <View
        style={[styles.bracket, styles.bracketBR, { bottom: B, right: R, borderColor: color }]}
      />
    </View>
  );
}

function RightControlPanel({
  insets,
  theme,
  themeColor,
  opacity,
  setOpacity,
  overlayMode,
  onSelectMode,
  flipped,
  onToggleFlip,
}: {
  insets: { top: number; bottom: number; left: number; right: number };
  theme: ThemePalette;
  themeColor: string;
  opacity: number;
  setOpacity: (n: number) => void;
  overlayMode: OverlayMode;
  onSelectMode: (mode: OverlayMode) => void;
  flipped: boolean;
  onToggleFlip: () => void;
}) {
  const sliderHeight = 110;
  return (
    <View
      style={[
        styles.rightPanel,
        {
          top: insets.top + 100,
          right: 14,
          borderColor: theme.glassBorder,
        },
      ]}
      pointerEvents="box-none">
      <View style={styles.panelInner} pointerEvents="auto">
        <ThemedText
          variant="captionSmall"
          weight="700"
          align="center"
          style={{ color: 'rgba(255,255,255,0.75)' }}>
          透明度
        </ThemedText>
        <ThemedText
          variant="titleSmall"
          weight="700"
          align="center"
          style={{ color: themeColor, marginTop: 2, marginBottom: 6 }}>
          {Math.round(opacity * 100)}%
        </ThemedText>
        <View style={{ height: sliderHeight, justifyContent: 'center', alignItems: 'center' }}>
          <Slider
            style={{
              width: sliderHeight,
              transform: [{ rotate: '-90deg' }],
            }}
            minimumValue={0.1}
            maximumValue={1}
            value={opacity}
            onValueChange={setOpacity}
            minimumTrackTintColor={themeColor}
            maximumTrackTintColor="rgba(255,255,255,0.25)"
            thumbTintColor="#fff"
          />
        </View>

        <View style={styles.modeStack}>
          <ModePill
            label="anime"
            active={overlayMode === 'anime'}
            themeColor={themeColor}
            onPress={() => onSelectMode('anime')}
          />
          <ModePill
            label="sketch"
            active={overlayMode === 'sketch'}
            themeColor={themeColor}
            onPress={() => onSelectMode('sketch')}
          />
          <ModePill
            label="edge"
            active={overlayMode === 'edge'}
            themeColor={themeColor}
            onPress={() => onSelectMode('edge')}
          />
        </View>

        <Pressable
          onPress={onToggleFlip}
          accessibilityRole="button"
          accessibilityLabel={flipped ? 'Unflip overlay' : 'Flip overlay horizontally'}
          style={({ pressed }) => [
            styles.flipBtn,
            {
              backgroundColor: flipped ? themeColor + '33' : 'rgba(255,255,255,0.10)',
              borderColor: flipped ? themeColor : 'rgba(255,255,255,0.22)',
              opacity: pressed ? 0.7 : 1,
            },
          ]}>
          <Ionicons
            name="swap-horizontal"
            size={16}
            color={flipped ? themeColor : '#fff'}
          />
        </Pressable>
      </View>
    </View>
  );
}

function ModePill({
  label,
  active,
  themeColor,
  onPress,
}: {
  label: string;
  active: boolean;
  themeColor: string;
  onPress: () => void;
}) {
  const fg = active ? readableTextOn(themeColor) : 'rgba(255,255,255,0.65)';
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${label} overlay`}
      hitSlop={6}
      style={({ pressed }) => [
        styles.modePill,
        {
          backgroundColor: active ? themeColor : 'rgba(255,255,255,0.08)',
          opacity: pressed ? 0.75 : 1,
        },
      ]}>
      <ThemedText variant="captionSmall" weight="700" style={{ color: fg }}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

function InfoPill({
  distanceMeters,
  headingDir,
  headingDeg,
  headingAligned,
  tilt,
  theme,
  themeColor,
  bottom,
}: {
  distanceMeters: number | null;
  headingDir: string | null;
  headingDeg: number | null;
  headingAligned: boolean;
  tilt: number | null;
  theme: ThemePalette;
  themeColor: string;
  bottom: number;
}) {
  const hasAny =
    distanceMeters !== null || headingDir !== null || tilt !== null;
  if (!hasAny) return null;

  const distanceText =
    distanceMeters === null
      ? '—'
      : distanceMeters < 100
        ? `${distanceMeters.toFixed(1)}m`
        : `${Math.round(distanceMeters)}m`;
  const headingText =
    headingDir !== null && headingDeg !== null ? `${headingDir} ${headingDeg}°` : '—';
  const tiltText =
    tilt === null ? '—' : `${tilt >= 0 ? '+' : '−'}${Math.abs(tilt).toFixed(1)}°`;

  return (
    <View style={[styles.infoPill, { bottom }]} pointerEvents="none">
      <View style={styles.infoCell}>
        <ThemedText
          variant="captionSmall"
          weight="700"
          style={{ color: 'rgba(255,255,255,0.55)' }}>
          距離
        </ThemedText>
        <View style={styles.infoRow}>
          <Ionicons name="location" size={12} color={themeColor} />
          <ThemedText variant="bodySmall" weight="700" style={{ color: '#fff' }}>
            {distanceText}
          </ThemedText>
        </View>
      </View>

      <View style={styles.infoDivider} />

      <View style={[styles.infoCell, { flex: 1.3 }]}>
        <ThemedText
          variant="captionSmall"
          weight="700"
          style={{ color: 'rgba(255,255,255,0.55)' }}>
          方位
        </ThemedText>
        <View style={styles.infoRow}>
          <Ionicons name="compass" size={12} color={themeColor} />
          <ThemedText variant="bodySmall" weight="700" style={{ color: '#fff' }}>
            {headingText}
          </ThemedText>
          {headingAligned ? (
            <View style={styles.alignedTag}>
              <Ionicons name="checkmark" size={10} color={theme.status.success} />
              <ThemedText
                variant="captionSmall"
                weight="700"
                style={{ color: theme.status.success }}>
                Aligned
              </ThemedText>
            </View>
          ) : null}
        </View>
      </View>

      <View style={styles.infoDivider} />

      <View style={styles.infoCell}>
        <ThemedText
          variant="captionSmall"
          weight="700"
          style={{ color: 'rgba(255,255,255,0.55)' }}>
          傾斜
        </ThemedText>
        <View style={styles.infoRow}>
          <Ionicons name="reorder-three" size={12} color={themeColor} />
          <ThemedText variant="bodySmall" weight="700" style={{ color: '#fff' }}>
            {tiltText}
          </ThemedText>
        </View>
      </View>
    </View>
  );
}

function ThumbnailBtn({
  kind,
  imageUrl,
  themeColor,
  onPress,
}: {
  kind: 'map' | 'reference';
  imageUrl?: string;
  themeColor: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={kind === 'map' ? 'Open map' : 'Show anime reference'}
      style={({ pressed }) => [
        styles.thumbBtn,
        {
          borderColor: kind === 'map' ? themeColor : 'rgba(255,255,255,0.28)',
          opacity: pressed ? 0.7 : 1,
        },
      ]}>
      {kind === 'reference' && imageUrl ? (
        <Image
          source={{ uri: imageUrl }}
          style={styles.thumbImage}
          contentFit="cover"
          transition={120}
        />
      ) : (
        <View style={[styles.thumbMap, { backgroundColor: 'rgba(0,0,0,0.5)' }]}>
          <Ionicons name="map" size={18} color={themeColor} />
        </View>
      )}
    </Pressable>
  );
}

function RuleOfThirdsGrid() {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <View style={[styles.gridLine, styles.gridV, { left: '33.33%' }]} />
      <View style={[styles.gridLine, styles.gridV, { left: '66.66%' }]} />
      <View style={[styles.gridLine, styles.gridH, { top: '33.33%' }]} />
      <View style={[styles.gridLine, styles.gridH, { top: '66.66%' }]} />
    </View>
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
  permBtn: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 999,
    marginTop: 12,
  },
  overlayWrap: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  overlayImage: {
    width: '100%',
    height: '100%',
  },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingBottom: 14,
    gap: 8,
  },
  topBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  topMid: { flex: 1, gap: 2 },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 18,
    paddingTop: 24,
  },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
  },
  shutterColumn: {
    alignItems: 'center',
  },
  shutterOuter: {
    width: 78,
    height: 78,
    borderRadius: 39,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderWidth: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterInner: {
    width: 56,
    height: 56,
    borderRadius: 28,
  },
  thumbBtn: {
    width: 56,
    height: 56,
    borderRadius: 12,
    borderWidth: 2,
    overflow: 'hidden',
  },
  thumbImage: {
    width: '100%',
    height: '100%',
  },
  thumbMap: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bottomActionRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 18,
    marginTop: 14,
  },
  miniBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  gridLine: {
    position: 'absolute',
    backgroundColor: 'rgba(255,255,255,0.32)',
  },
  gridV: { width: 1, top: 0, bottom: 0 },
  gridH: { height: 1, left: 0, right: 0 },
  liveBadgeWrap: {
    position: 'absolute',
    left: 14,
    flexDirection: 'row',
  },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#FF3B30',
  },
  rotationBadge: {
    position: 'absolute',
    right: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderWidth: 1,
  },
  resetChip: {
    position: 'absolute',
    left: 76,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.7)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  bracket: {
    position: 'absolute',
    width: 22,
    height: 22,
    borderWidth: 3,
  },
  bracketTL: {
    borderRightWidth: 0,
    borderBottomWidth: 0,
    borderTopLeftRadius: 4,
  },
  bracketTR: {
    borderLeftWidth: 0,
    borderBottomWidth: 0,
    borderTopRightRadius: 4,
  },
  bracketBL: {
    borderRightWidth: 0,
    borderTopWidth: 0,
    borderBottomLeftRadius: 4,
  },
  bracketBR: {
    borderLeftWidth: 0,
    borderTopWidth: 0,
    borderBottomRightRadius: 4,
  },
  rightPanel: {
    position: 'absolute',
    width: 72,
    borderRadius: 18,
    backgroundColor: 'rgba(20,20,20,0.78)',
    borderWidth: 1,
    paddingVertical: 12,
    paddingHorizontal: 6,
  },
  panelInner: {
    alignItems: 'stretch',
    gap: 8,
  },
  modeStack: {
    gap: 6,
    alignItems: 'stretch',
    marginTop: 4,
  },
  modePill: {
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 999,
    alignItems: 'center',
  },
  flipBtn: {
    alignSelf: 'center',
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    marginTop: 6,
  },
  infoPill: {
    position: 'absolute',
    left: 14,
    right: 14,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    gap: 10,
  },
  infoCell: {
    flex: 1,
    gap: 2,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  infoDivider: {
    width: 1,
    height: 28,
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  alignedTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
    backgroundColor: 'rgba(0,0,0,0.35)',
    marginLeft: 4,
  },
  alignmentChipWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  alignmentChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
  chipDot: {
    width: 3,
    height: 3,
    borderRadius: 2,
    marginHorizontal: 2,
  },
  perfectBanner: {
    position: 'absolute',
    left: '15%',
    right: '15%',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 999,
  },
  rotateHintWrap: {
    position: 'absolute',
    top: '40%',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  rotateHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.7)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
  },
  edgeLoader: {
    position: 'absolute',
    top: 14,
    right: 14,
    padding: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
});
