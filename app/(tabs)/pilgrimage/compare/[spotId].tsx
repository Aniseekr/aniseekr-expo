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
import {
  GestureDetector,
  Gesture,
  GestureHandlerRootView,
} from 'react-native-gesture-handler';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { Canvas, Image as SkiaImage } from '@shopify/react-native-skia';
import { useTheme } from '../../../../context/ThemeContext';
import { hapticsBridge } from '../../../../modules/haptics/hapticsBridge';
import { ThemedText } from '../../../../components/themed';
import {
  locationService,
  type LatLng,
} from '../../../../libs/services/pilgrimage/location-service';
import {
  computeAlignmentScore,
  type AlignmentSensors,
} from '../../../../libs/services/pilgrimage/alignment-scoring';
import { getWalkDirections } from '../../../../libs/services/pilgrimage/walk-directions';
import { useEdgeImage } from '../../../../libs/services/pilgrimage/edge-image-skia';

type SearchParams = {
  spotId: string;
  imageUrl: string;
  name: string;
  ep: string;
  animeId: string;
  themeColor: string;
  spotLat: string;
  spotLng: string;
};

function bearingBetween(from: LatLng, to: LatLng): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const toDeg = (r: number) => (r * 180) / Math.PI;
  const phi1 = toRad(from.latitude);
  const phi2 = toRad(to.latitude);
  const dLambda = toRad(to.longitude - from.longitude);
  const y = Math.sin(dLambda) * Math.cos(phi2);
  const x =
    Math.cos(phi1) * Math.sin(phi2) -
    Math.sin(phi1) * Math.cos(phi2) * Math.cos(dLambda);
  const theta = Math.atan2(y, x);
  return (toDeg(theta) + 360) % 360;
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
  const themeColor = params.themeColor || theme.accent;

  const { width: winW, height: winH } = useWindowDimensions();
  const isLandscape = winW > winH;

  const targetLocation = useMemo<LatLng | null>(() => {
    const lat = Number(params.spotLat);
    const lng = Number(params.spotLng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return { latitude: lat, longitude: lng };
  }, [params.spotLat, params.spotLng]);

  const cameraRef = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();

  const [facing, setFacing] = useState<CameraType>('back');
  const [opacity, setOpacity] = useState(0.5);
  const [grid, setGrid] = useState(true);
  const [heading, setHeading] = useState<number | null>(null);
  const [tilt, setTilt] = useState<number | null>(null);
  const [capturing, setCapturing] = useState(false);
  const [userLocation, setUserLocation] = useState<LatLng | null>(null);
  const [overlayMode, setOverlayMode] = useState<'color' | 'edge'>('color');
  const [lockedAt, setLockedAt] = useState<number | null>(null);
  const [perfectFiredAt, setPerfectFiredAt] = useState<number | null>(null);
  const [showPerfectBanner, setShowPerfectBanner] = useState(false);
  const [hintDismissed, setHintDismissed] = useState(false);
  const perfectOpacity = useRef(new RNAnimated.Value(0)).current;
  const hintOpacity = useRef(new RNAnimated.Value(1)).current;
  const [hintIconLandscape, setHintIconLandscape] = useState(false);

  // Overlay gesture transforms
  const scale = useSharedValue(1);
  const baseScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const baseTranslateX = useSharedValue(0);
  const baseTranslateY = useSharedValue(0);
  const rotation = useSharedValue(0);
  const baseRotation = useSharedValue(0);

  // Tips screen pre-checks permission before navigating here, so we shouldn't
  // normally land in a denied state. If we do (deep link, settings flip),
  // surface a clear settings affordance instead of the implicit auto-call —
  // iOS silently ignores requestPermission once canAskAgain is false.
  useEffect(() => {
    if (!permission) return;
    if (!permission.granted && permission.canAskAgain) {
      requestPermission().catch(() => undefined);
    }
  }, [permission, requestPermission]);

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
      // crude heading from magnetometer x/y; iOS DeviceMotion would be more
      // accurate but this is informational only — enough to nudge framing.
      const angle = Math.atan2(data.y, data.x);
      let deg = (angle * 180) / Math.PI;
      // align so 0 = North, increasing clockwise
      deg = (90 - deg + 360) % 360;
      setHeading(deg);
    });
    DeviceMotion.setUpdateInterval(200);
    DeviceMotion.isAvailableAsync()
      .then((ok) => {
        if (!ok) return;
        motionSub = DeviceMotion.addListener((data) => {
          // pitch (rotation around X axis) tells us forward tilt of phone
          const pitch = data.rotation?.beta ?? 0;
          // convert to degrees; 0° = phone vertical pointing forward
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
  const walk = useMemo(() => getWalkDirections(sensors), [sensors]);

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

  // Fire the perfect-moment banner once after the lock has held for 800 ms.
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

  // Once the user actually rotates to landscape we never want to nag them again.
  useEffect(() => {
    if (isLandscape) setHintDismissed(true);
  }, [isLandscape]);

  // Auto-dismiss the rotate hint after 5s — keep nag short.
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

  // Toggle the hint icon between portrait/landscape every 800 ms so users
  // see the intended motion at a glance.
  useEffect(() => {
    if (hintDismissed || isLandscape) return;
    const t = setInterval(() => setHintIconLandscape((v) => !v), 800);
    return () => clearInterval(t);
  }, [hintDismissed, isLandscape]);

  const pinch = useMemo(
    () =>
      Gesture.Pinch()
        .onStart(() => {
          baseScale.value = scale.value;
        })
        .onUpdate((e) => {
          const next = baseScale.value * e.scale;
          scale.value = Math.max(0.25, Math.min(4, next));
        }),
    [scale, baseScale]
  );

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .onStart(() => {
          baseTranslateX.value = translateX.value;
          baseTranslateY.value = translateY.value;
        })
        .onUpdate((e) => {
          translateX.value = baseTranslateX.value + e.translationX;
          translateY.value = baseTranslateY.value + e.translationY;
        }),
    [translateX, translateY, baseTranslateX, baseTranslateY]
  );

  const rotate = useMemo(
    () =>
      Gesture.Rotation()
        .onStart(() => {
          baseRotation.value = rotation.value;
        })
        .onUpdate((e) => {
          rotation.value = baseRotation.value + e.rotation;
        }),
    [rotation, baseRotation]
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
    ],
  }));

  const resetTransforms = useCallback(() => {
    hapticsBridge.tap();
    scale.value = withSpring(1);
    translateX.value = withSpring(0);
    translateY.value = withSpring(0);
    rotation.value = withSpring(0);
  }, [scale, translateX, translateY, rotation]);

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
          distanceMeters:
            snapshot.distanceMeters != null ? String(snapshot.distanceMeters) : '',
          headingDeltaDeg:
            snapshot.headingDeltaDeg != null ? String(snapshot.headingDeltaDeg) : '',
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
    tilt,
  ]);

  const toggleOverlayMode = useCallback(() => {
    hapticsBridge.selection();
    setOverlayMode((prev) => (prev === 'color' ? 'edge' : 'color'));
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

  if (!permission) {
    return (
      <View style={[styles.permRoot, { backgroundColor: theme.background.primary }]} />
    );
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
                  // iOS won't re-prompt — only Settings can flip it back on.
                  Linking.openSettings().catch(() => undefined);
                }
              }}
              style={({ pressed }) => [
                styles.permBtn,
                { backgroundColor: themeColor, opacity: pressed ? 0.85 : 1 },
              ]}>
              <ThemedText variant="titleSmall" weight="700" style={{ color: '#000' }}>
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

  return (
    <GestureHandlerRootView style={styles.root}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.root}>
        <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing={facing} />

        {grid ? <RuleOfThirdsGrid /> : null}

        <GestureDetector gesture={composedGesture}>
          <Animated.View style={[styles.overlayWrap, overlayStyle]} pointerEvents="auto">
            {overlayMode === 'color' ? (
              <Image
                source={{ uri: imageUrl }}
                style={[styles.overlayImage, { opacity }]}
                contentFit="contain"
                transition={120}
              />
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
            {overlayMode === 'edge' && edgeLoading ? (
              <View style={styles.edgeLoader} pointerEvents="none">
                <ActivityIndicator size="small" color="#fff" />
              </View>
            ) : null}
          </Animated.View>
        </GestureDetector>

        <LinearGradient
          colors={['rgba(0,0,0,0.72)', 'rgba(0,0,0,0)']}
          style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
          <Pressable
            onPress={() => router.back()}
            hitSlop={14}
            style={({ pressed }) => [styles.topBtn, pressed && { opacity: 0.6 }]}
            accessibilityRole="button"
            accessibilityLabel="Close camera">
            <Ionicons name="close" size={24} color="#fff" />
          </Pressable>
          <View style={styles.topMid}>
            <ThemedText
              variant="bodyMedium"
              weight="700"
              align="center"
              style={{ color: '#fff' }}
              numberOfLines={1}>
              {sceneName}
            </ThemedText>
            {ep ? (
              <ThemedText
                variant="captionSmall"
                align="center"
                style={{ color: 'rgba(255,255,255,0.7)' }}>
                EP {ep}
              </ThemedText>
            ) : null}
          </View>
          <Pressable
            onPress={resetTransforms}
            hitSlop={14}
            style={({ pressed }) => [styles.topBtn, pressed && { opacity: 0.6 }]}
            accessibilityRole="button"
            accessibilityLabel="Reset overlay position">
            <Ionicons name="refresh" size={22} color="#fff" />
          </Pressable>
        </LinearGradient>

        <View style={[styles.liveBadgeWrap, { top: insets.top + 60 }]}>
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

        <AlignmentOverlay
          score={score}
          walk={walk}
          tilt={tilt}
          theme={theme}
          themeColor={themeColor}
          bottom={insets.bottom + 188}
        />

        {/* v1 fallback: bottom bar stays anchored to the bottom in landscape too — rotation hint alone delivers the framing UX. */}
        <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 12 }]}>
          <LinearGradient
            colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.72)']}
            style={StyleSheet.absoluteFill}
          />
          <View style={styles.sliderRow}>
            <Ionicons name="image-outline" size={16} color="#fff" />
            <Slider
              style={styles.slider}
              minimumValue={0.1}
              maximumValue={1}
              value={opacity}
              onValueChange={setOpacity}
              minimumTrackTintColor={themeColor}
              maximumTrackTintColor="rgba(255,255,255,0.3)"
              thumbTintColor="#fff"
            />
            <ThemedText
              variant="captionSmall"
              weight="600"
              style={{ color: '#fff', width: 36, textAlign: 'right' }}>
              {Math.round(opacity * 100)}%
            </ThemedText>
          </View>

          <View style={styles.actionRow}>
            <CircleBtn
              icon={overlayMode === 'edge' ? 'color-palette-outline' : 'pencil'}
              accessibilityLabel={
                overlayMode === 'edge'
                  ? 'Switch to colour overlay'
                  : 'Switch to edge overlay'
              }
              onPress={toggleOverlayMode}
              active={overlayMode === 'edge'}
              activeColor={themeColor}
            />
            <CircleBtn
              icon={grid ? 'grid' : 'grid-outline'}
              accessibilityLabel="Toggle rule-of-thirds grid"
              onPress={toggleGrid}
              active={grid}
              activeColor={themeColor}
            />
            <Pressable
              onPress={handleShutter}
              disabled={capturing}
              accessibilityRole="button"
              accessibilityLabel="Take comparison photo"
              style={({ pressed }) => [
                styles.shutterOuter,
                pressed && { opacity: 0.85 },
                capturing && { opacity: 0.6 },
              ]}>
              <View style={[styles.shutterInner, { backgroundColor: '#fff' }]} />
            </Pressable>
            <CircleBtn
              icon="camera-reverse-outline"
              accessibilityLabel="Switch front/back camera"
              onPress={toggleFacing}
            />
          </View>

          <ThemedText
            variant="captionSmall"
            align="center"
            style={{ color: 'rgba(255,255,255,0.6)', marginTop: 6 }}>
            Pinch · drag · twist the reference to align
          </ThemedText>
        </View>

        {showPerfectBanner ? (
          <RNAnimated.View
            pointerEvents="none"
            style={[
              styles.perfectBanner,
              {
                bottom: insets.bottom + 220,
                backgroundColor: theme.status.success,
                opacity: perfectOpacity,
              },
            ]}>
            <Ionicons name="checkmark-circle" size={18} color="#fff" />
            <ThemedText
              variant="bodySmall"
              weight="700"
              style={{ color: '#fff' }}>
              完美時刻 · Perfect alignment
            </ThemedText>
          </RNAnimated.View>
        ) : null}

        {!isLandscape && !hintDismissed ? (
          <RNAnimated.View
            style={[styles.rotateHintWrap, { opacity: hintOpacity }]}
            pointerEvents="box-none">
            <Pressable
              onPress={dismissHint}
              accessibilityRole="button"
              accessibilityLabel="Dismiss rotate hint"
              style={({ pressed }) => [
                styles.rotateHint,
                pressed && { opacity: 0.85 },
              ]}>
              <Ionicons
                name={hintIconLandscape ? 'phone-landscape-outline' : 'phone-portrait-outline'}
                size={18}
                color="#fff"
              />
              <ThemedText
                variant="captionSmall"
                weight="700"
                style={{ color: '#fff' }}>
                請旋轉手機 · Rotate for 16:9 framing
              </ThemedText>
            </Pressable>
          </RNAnimated.View>
        ) : null}
      </View>
    </GestureHandlerRootView>
  );
}

function CircleBtn({
  icon,
  accessibilityLabel,
  onPress,
  active,
  activeColor,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  accessibilityLabel: string;
  onPress: () => void;
  active?: boolean;
  activeColor?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      hitSlop={10}
      style={({ pressed }) => [
        styles.circleBtn,
        {
          backgroundColor: active && activeColor ? activeColor + '33' : 'rgba(255,255,255,0.18)',
          borderColor: active && activeColor ? activeColor : 'rgba(255,255,255,0.35)',
          opacity: pressed ? 0.65 : 1,
        },
      ]}>
      <Ionicons name={icon} size={20} color={active && activeColor ? activeColor : '#fff'} />
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

type AlignmentScoreShape = {
  position: number | null;
  heading: number | null;
  tilt: number | null;
  total: number | null;
  distanceMeters: number | null;
  headingDeltaDeg: number | null;
};

type WalkShape = {
  distanceText: string | null;
  headingText: string | null;
  tiltText: string | null;
};

function AlignmentOverlay({
  score,
  walk,
  tilt,
  theme,
  themeColor,
  bottom,
}: {
  score: AlignmentScoreShape;
  walk: WalkShape;
  tilt: number | null;
  theme: ReturnType<typeof useTheme>['theme'];
  themeColor: string;
  bottom: number;
}) {
  const hasAny = score.position !== null || score.heading !== null || score.tilt !== null;
  if (!hasAny) return null;

  const walkLine = [walk.distanceText, walk.headingText, walk.tiltText]
    .filter((s): s is string => Boolean(s))
    .join(' · ');

  const totalPct = score.total !== null ? Math.round(score.total * 100) : null;
  const totalTone =
    score.total === null
      ? '#fff'
      : score.total >= 0.8
      ? theme.status.success
      : score.total >= 0.5
      ? themeColor
      : theme.status.warning;

  return (
    <View style={[styles.alignmentWrap, { bottom }]} pointerEvents="none">
      <View style={styles.alignmentBars}>
        {score.position !== null ? (
          <AlignmentBar
            label="Position"
            fill={score.position}
            value={
              score.distanceMeters !== null
                ? `${score.distanceMeters.toFixed(1)} m`
                : '—'
            }
            tone={themeColor}
          />
        ) : null}
        {score.heading !== null ? (
          <AlignmentBar
            label="Heading"
            fill={score.heading}
            value={
              score.headingDeltaDeg !== null
                ? `±${Math.round(Math.abs(score.headingDeltaDeg))}°`
                : '—'
            }
            tone={themeColor}
          />
        ) : null}
        {score.tilt !== null ? (
          <AlignmentBar
            label="Tilt"
            fill={score.tilt}
            value={
              tilt !== null
                ? `${tilt >= 0 ? '+' : '−'}${Math.abs(tilt).toFixed(0)}°`
                : '—'
            }
            tone={themeColor}
          />
        ) : null}
        {walkLine ? (
          <ThemedText
            variant="captionSmall"
            weight="600"
            style={{ color: 'rgba(255,255,255,0.85)', marginTop: 4 }}>
            {walkLine}
          </ThemedText>
        ) : null}
      </View>
      {totalPct !== null ? (
        <View style={styles.alignmentTotal}>
          <ThemedText
            variant="displayMedium"
            weight="700"
            style={{ color: totalTone, lineHeight: 32 }}>
            {totalPct}
          </ThemedText>
          <ThemedText variant="bodySmall" weight="700" style={{ color: totalTone }}>
            %
          </ThemedText>
        </View>
      ) : null}
    </View>
  );
}

function AlignmentBar({
  label,
  fill,
  value,
  tone,
}: {
  label: string;
  fill: number;
  value: string;
  tone: string;
}) {
  const pct = Math.max(0, Math.min(1, fill)) * 100;
  return (
    <View style={styles.alignmentRow}>
      <ThemedText variant="captionSmall" weight="700" style={styles.alignmentLabel}>
        {label}
      </ThemedText>
      <View style={[styles.alignmentTrack, { backgroundColor: 'rgba(255,255,255,0.18)' }]}>
        <View
          style={[
            styles.alignmentFill,
            { width: `${pct}%`, backgroundColor: tone },
          ]}
        />
      </View>
      <ThemedText variant="captionSmall" weight="700" style={styles.alignmentValue}>
        {value}
      </ThemedText>
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
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.45)',
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
    paddingTop: 16,
  },
  sliderRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  slider: { flex: 1, height: 28 },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 14,
  },
  circleBtn: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  shutterOuter: {
    width: 78,
    height: 78,
    borderRadius: 39,
    backgroundColor: 'rgba(255,255,255,0.25)',
    borderWidth: 4,
    borderColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterInner: {
    width: 60,
    height: 60,
    borderRadius: 30,
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
  alignmentWrap: {
    position: 'absolute',
    left: 14,
    right: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  alignmentBars: {
    flex: 1,
    gap: 6,
  },
  alignmentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  alignmentLabel: {
    color: 'rgba(255,255,255,0.75)',
    width: 56,
  },
  alignmentTrack: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  alignmentFill: {
    height: 6,
    borderRadius: 3,
  },
  alignmentValue: {
    color: '#fff',
    width: 56,
    textAlign: 'right',
  },
  alignmentTotal: {
    flexDirection: 'row',
    alignItems: 'baseline',
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
