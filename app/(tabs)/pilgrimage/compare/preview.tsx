import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { GestureDetector, Gesture, GestureHandlerRootView } from 'react-native-gesture-handler';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import * as MediaLibrary from 'expo-media-library';
import { captureRef } from 'react-native-view-shot';
import Ionicons from '@expo/vector-icons/Ionicons';
import { bottomPad } from '../../../../constants/DesignSystem';
import { useTheme, type ThemePalette } from '../../../../context/ThemeContext';
import { hapticsBridge } from '../../../../modules/haptics/hapticsBridge';
import { ThemedText } from '../../../../components/themed';
import { recordCapture, type SensorSnapshot } from '../../../../libs/services/pilgrimage/captures';
import { toFullResImageUrl } from '../../../../libs/services/pilgrimage/anitabi-image';
import { scoreSnapshot } from '../../../../libs/services/pilgrimage/alignment-scoring';
import {
  computeFrameMatch,
  type FrameMatch,
} from '../../../../libs/services/pilgrimage/frame-match';
import { getNumberParam, getStringParam } from '../../../../libs/utils/route-params';

function getRetakeTip(s: SensorSnapshot | null): string | null {
  if (!s) return null;
  if (s.headingDeltaDeg != null && Math.abs(s.headingDeltaDeg) > 15) {
    return s.headingDeltaDeg > 0
      ? 'Turn a little more to the right next time to match the reference heading.'
      : 'Turn a little more to the left next time to match the reference heading.';
  }
  if (s.distanceMeters != null && s.distanceMeters > 20) {
    return 'Move closer next time; distance has a large effect on matching the frame.';
  }
  if (s.tilt != null && Math.abs(s.tilt) > 10) {
    return s.tilt > 0
      ? 'Level the phone a little more next time to avoid skewing the ground plane.'
      : 'Tilt the phone slightly downward next time to reduce excess sky in the frame.';
  }
  return null;
}

function formatSignedDeg(value: number): string {
  const rounded = Math.round(value);
  if (rounded > 0) return `+${rounded}°`;
  if (rounded < 0) return `−${Math.abs(rounded)}°`;
  return '0°';
}

type Mode = 'stacked' | 'sideBySide' | 'overlay' | 'slider';

export default function ComparePreviewScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const params = useLocalSearchParams();

  const spotId = getStringParam(params, 'spotId') ?? '';
  // Strip Anitabi's `?plan=h160` thumbnail token so the side-by-side / overlay
  // / slider stage renders the original 1920×1080 frame instead of pixelating
  // the 284×160 thumb. Defensive — [spotId].tsx already upgrades it, but the
  // album screen still hands in the raw thumbnail URL.
  const imageUrl = toFullResImageUrl(getStringParam(params, 'imageUrl') ?? '');
  const shotUri = getStringParam(params, 'shotUri') ?? '';
  const sceneName = getStringParam(params, 'name') ?? 'Scene';
  const ep = getStringParam(params, 'ep');
  const animeId = getStringParam(params, 'animeId');
  const animeTitle = getStringParam(params, 'animeTitle');
  const themeColor = getStringParam(params, 'themeColor') || theme.accent;
  const heading = getNumberParam(params, 'heading');
  const spotLat = getStringParam(params, 'spotLat');
  const spotLng = getStringParam(params, 'spotLng');

  const [mode, setMode] = useState<Mode>('stacked');
  const [overlayOpacity, setOverlayOpacity] = useState(0.5);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [mediaPerm, requestMediaPerm] = MediaLibrary.usePermissions({
    granularPermissions: ['photo'],
  });
  const [stagePx, setStagePx] = useState({ width: 0, height: 0 });

  // Alignment sensor snapshot — strictly real data from capture-time sensors.
  // Returns null when no sensor reading was passed; the UI then omits the
  // alignment cards instead of inventing a score.
  const sensorSnapshot = useMemo<SensorSnapshot | null>(() => {
    const dist = getNumberParam(params, 'distanceMeters');
    const head = getNumberParam(params, 'headingDeltaDeg');
    const tlt = getNumberParam(params, 'tilt');
    if (dist == null && head == null && tlt == null) return null;
    return { distanceMeters: dist, headingDeltaDeg: head, tilt: tlt };
  }, [params]);

  // Position lock from sensors — what the live camera badge measured. cos²
  // falloff via the shared scoreSnapshot helper so this screen, the live
  // badge, and the share card all use one formula.
  const positionScore = useMemo(
    () => (sensorSnapshot ? scoreSnapshot(sensorSnapshot) : null),
    [sensorSnapshot]
  );

  // Frame match — does the photo actually look like the anime reference?
  // Computed on mount via Skia (one decode per side at 64×64). Loading state
  // is honest: we show "—" rather than a fake placeholder.
  const [frameMatch, setFrameMatch] = useState<FrameMatch | null>(null);
  const [frameLoading, setFrameLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setFrameLoading(true);
    setFrameMatch(null);
    if (!imageUrl || !shotUri) {
      setFrameLoading(false);
      return () => {
        cancelled = true;
      };
    }
    void computeFrameMatch(imageUrl, shotUri)
      .then((m) => {
        if (cancelled) return;
        setFrameMatch(m);
      })
      .catch((err) => {
        console.warn('frame match failed', err);
        if (cancelled) return;
        setFrameMatch({
          histogram: null,
          edge: null,
          lighting: null,
          total: null,
          valid: false,
          reason: 'analysisFailed',
        });
      })
      .finally(() => {
        if (!cancelled) setFrameLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [imageUrl, shotUri]);

  const retakeTip = useMemo(() => getRetakeTip(sensorSnapshot), [sensorSnapshot]);

  // The big number = frame match (what the user perceives as "did my photo
  // match"). Position lock is shown alongside but smaller.
  const frameTone = useMemo(() => {
    if (frameMatch?.total == null) return theme.accent;
    if (!frameMatch.valid) return theme.status.error;
    if (frameMatch.total >= 0.8) return theme.status.success;
    if (frameMatch.total >= 0.5) return theme.accent;
    return theme.status.warning;
  }, [frameMatch, theme.accent, theme.status.error, theme.status.success, theme.status.warning]);

  const frameBannerText = useMemo<string | null>(() => {
    if (!frameMatch || frameMatch.valid) return null;
    switch (frameMatch.reason) {
      case 'dark':
        return 'This photo looks completely dark — lens may be covered. Try again.';
      case 'lowDetail':
        return 'This photo has no detail — check focus and lens cover.';
      case 'lowContrast':
        return 'This photo is very flat — check exposure or pick a more textured scene.';
      case 'analysisFailed':
        return 'Could not analyze this photo. Frame match is unavailable.';
      default:
        return null;
    }
  }, [frameMatch]);

  const stageRef = useRef<View>(null);

  // Slider drag position (0..1) for slider mode
  const sliderProgress = useSharedValue(0.5);
  const baseProgress = useSharedValue(0.5);
  const stageWidth = useSharedValue(0);

  const sliderPan = useMemo(
    () =>
      Gesture.Pan()
        .onStart(() => {
          baseProgress.value = sliderProgress.value;
        })
        .onUpdate((e) => {
          if (stageWidth.value <= 0) return;
          const dx = e.translationX / stageWidth.value;
          const next = baseProgress.value + dx;
          sliderProgress.value = Math.max(0.02, Math.min(0.98, next));
        }),
    [baseProgress, sliderProgress, stageWidth]
  );

  const sliderClipStyle = useAnimatedStyle(() => ({
    width: `${sliderProgress.value * 100}%` as `${number}%`,
  }));

  const sliderHandleStyle = useAnimatedStyle(() => ({
    left: `${sliderProgress.value * 100}%` as `${number}%`,
  }));

  const handleStageLayout = useCallback(
    (e: { nativeEvent: { layout: { width: number; height: number } } }) => {
      const { width, height } = e.nativeEvent.layout;
      stageWidth.value = width;
      setStagePx({ width, height });
    },
    [stageWidth]
  );

  const persistCapture = useCallback(
    async (compositeUri?: string) => {
      const enrichedSnapshot: SensorSnapshot | undefined = sensorSnapshot
        ? {
            ...sensorSnapshot,
            frameMatch: frameMatch?.total ?? null,
            frameValid: frameMatch ? frameMatch.valid : null,
            frameReason: frameMatch?.reason ?? null,
          }
        : undefined;
      await recordCapture({
        spotId,
        uri: shotUri,
        compositeUri,
        capturedAt: Date.now(),
        heading: heading ?? undefined,
        sensorSnapshot: enrichedSnapshot,
      });
    },
    [spotId, shotUri, heading, sensorSnapshot, frameMatch]
  );

  const snapshotComposite = useCallback(async (): Promise<string | null> => {
    if (!stageRef.current) return null;
    try {
      const uri = await captureRef(stageRef.current, {
        format: 'png',
        quality: 0.95,
        result: 'tmpfile',
      });
      return uri;
    } catch (err) {
      console.warn('snapshot failed', err);
      return null;
    }
  }, []);

  const ensureMediaPerm = useCallback(async () => {
    if (mediaPerm?.granted) return true;
    const next = await requestMediaPerm();
    return next.granted;
  }, [mediaPerm, requestMediaPerm]);

  const handleSave = useCallback(async () => {
    if (saving) return;
    setSaving(true);
    hapticsBridge.success();
    try {
      const ok = await ensureMediaPerm();
      if (!ok) {
        setSaving(false);
        return;
      }
      const composite = await snapshotComposite();
      await MediaLibrary.saveToLibraryAsync(shotUri);
      if (composite) {
        await MediaLibrary.saveToLibraryAsync(composite);
      }
      await persistCapture(composite ?? undefined);
      setSaved(true);
    } catch (err) {
      console.warn('save failed', err);
    } finally {
      setSaving(false);
    }
  }, [saving, ensureMediaPerm, snapshotComposite, shotUri, persistCapture]);

  const handleShare = useCallback(() => {
    hapticsBridge.tap();
    const shareParams: Record<string, string> = {
      spotId,
      imageUrl,
      shotUri,
      name: sceneName,
      ep: ep ?? '',
      animeId: animeId ?? '',
      animeTitle: animeTitle ?? '',
      themeColor,
      spotLat: spotLat ?? '',
      spotLng: spotLng ?? '',
    };
    // matchScore is now the *frame* match (what the user perceives as "did my
    // photo match the anime"). The position lock travels separately so the
    // share card can show both honestly.
    if (frameMatch?.total != null) {
      shareParams.matchScore = String(Math.round(frameMatch.total * 100));
    }
    if (frameMatch) {
      shareParams.frameValid = frameMatch.valid ? '1' : '0';
      if (frameMatch.reason) shareParams.frameReason = frameMatch.reason;
    }
    if (positionScore?.total != null) {
      shareParams.positionScore = String(Math.round(positionScore.total * 100));
    }
    router.push({
      pathname: '/pilgrimage/compare/share',
      params: shareParams,
    });
  }, [
    router,
    spotId,
    imageUrl,
    shotUri,
    sceneName,
    ep,
    animeId,
    animeTitle,
    themeColor,
    spotLat,
    spotLng,
    frameMatch,
    positionScore,
  ]);

  const handleRetake = useCallback(() => {
    hapticsBridge.tap();
    router.back();
  }, [router]);

  useEffect(() => {
    // Persist the raw shot immediately on mount so even if user backs out
    // without saving, the spot still shows "captured" status.
    void persistCapture();
  }, [persistCapture]);

  return (
    <GestureHandlerRootView style={[styles.root, { backgroundColor: theme.background.primary }]}>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <View style={styles.header}>
          <Pressable
            onPress={() => router.back()}
            hitSlop={14}
            style={({ pressed }) => [styles.headerBtn, pressed && { opacity: 0.6 }]}
            accessibilityRole="button"
            accessibilityLabel="Back">
            <Ionicons name="chevron-back" size={22} color={theme.text.primary} />
          </Pressable>
          <View style={styles.headerMid}>
            <ThemedText variant="titleLarge" weight="700" align="center" numberOfLines={1}>
              Comparison Result
            </ThemedText>
            <ThemedText variant="captionSmall" tone="secondary" align="center" numberOfLines={1}>
              {ep ? `EP ${ep} · ` : ''}
              {sceneName}
            </ThemedText>
          </View>
          <Pressable
            onPress={handleShare}
            hitSlop={14}
            style={({ pressed }) => [styles.headerBtn, pressed && { opacity: 0.6 }]}
            accessibilityRole="button"
            accessibilityLabel="Share">
            <Ionicons name="share-outline" size={22} color={theme.text.primary} />
          </Pressable>
        </View>

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}>
          {frameBannerText ? (
            <View
              style={[
                styles.invalidBanner,
                {
                  backgroundColor: `${theme.status.error}1F`,
                  borderColor: theme.status.error,
                },
              ]}>
              <Ionicons name="alert-circle" size={18} color={theme.status.error} />
              <ThemedText
                variant="bodySmall"
                weight="600"
                style={{ flex: 1, color: theme.status.error }}>
                {frameBannerText}
              </ThemedText>
            </View>
          ) : null}

          {sensorSnapshot || frameLoading || frameMatch ? (
            <View
              style={[
                styles.scoreCard,
                {
                  backgroundColor: theme.background.secondary,
                  borderColor: theme.glassBorder,
                },
              ]}>
              <View style={{ flex: 1, gap: 10 }}>
                <ThemedText variant="captionSmall" tone="secondary" weight="600">
                  Frame Match
                </ThemedText>
                {positionScore?.total != null ? (
                  <ThemedText variant="captionSmall" tone="secondary">
                    Position lock {Math.round(positionScore.total * 100)}%
                  </ThemedText>
                ) : null}
                {sensorSnapshot ? (
                  <View style={styles.pillRow}>
                    {sensorSnapshot.distanceMeters != null ? (
                      <View
                        style={[
                          styles.pill,
                          {
                            backgroundColor: theme.background.tertiary,
                            borderColor: theme.glassBorder,
                          },
                        ]}>
                        <ThemedText variant="bodySmall" weight="700">
                          {`${sensorSnapshot.distanceMeters.toFixed(1)} m`}
                        </ThemedText>
                        <ThemedText variant="captionSmall" tone="secondary">
                          Distance to spot
                        </ThemedText>
                      </View>
                    ) : null}
                    {sensorSnapshot.headingDeltaDeg != null ? (
                      <View
                        style={[
                          styles.pill,
                          {
                            backgroundColor: theme.background.tertiary,
                            borderColor: theme.glassBorder,
                          },
                        ]}>
                        <ThemedText variant="bodySmall" weight="700">
                          {formatSignedDeg(sensorSnapshot.headingDeltaDeg)}
                        </ThemedText>
                        <ThemedText variant="captionSmall" tone="secondary">
                          Heading offset
                        </ThemedText>
                      </View>
                    ) : null}
                    {sensorSnapshot.tilt != null ? (
                      <View
                        style={[
                          styles.pill,
                          {
                            backgroundColor: theme.background.tertiary,
                            borderColor: theme.glassBorder,
                          },
                        ]}>
                        <ThemedText variant="bodySmall" weight="700">
                          {formatSignedDeg(sensorSnapshot.tilt)}
                        </ThemedText>
                        <ThemedText variant="captionSmall" tone="secondary">
                          Tilt offset
                        </ThemedText>
                      </View>
                    ) : null}
                  </View>
                ) : null}
              </View>
              <View style={styles.overallWrap}>
                {frameLoading ? (
                  <ActivityIndicator size="small" color={theme.accent} />
                ) : frameMatch?.total != null ? (
                  <>
                    <ThemedText
                      variant="displayMedium"
                      weight="700"
                      style={{ color: frameTone, lineHeight: 36 }}>
                      {Math.round(frameMatch.total * 100)}
                    </ThemedText>
                    <ThemedText variant="bodyMedium" weight="700" style={{ color: frameTone }}>
                      %
                    </ThemedText>
                  </>
                ) : (
                  <ThemedText
                    variant="displayMedium"
                    weight="700"
                    style={{ color: theme.text.tertiary, lineHeight: 36 }}>
                    —
                  </ThemedText>
                )}
              </View>
            </View>
          ) : null}

          <View style={styles.modeRow}>
            {(['stacked', 'sideBySide', 'overlay', 'slider'] as Mode[]).map((m) => {
              const active = m === mode;
              const label =
                m === 'stacked'
                  ? 'Stacked'
                  : m === 'sideBySide'
                    ? 'Side by side'
                    : m === 'overlay'
                      ? 'Overlay'
                      : 'Slider';
              return (
                <Pressable
                  key={m}
                  onPress={() => {
                    hapticsBridge.selection();
                    setMode(m);
                  }}
                  style={({ pressed }) => [
                    styles.modeBtn,
                    {
                      backgroundColor: active ? themeColor : theme.background.secondary,
                      borderColor: active ? themeColor : theme.glassBorder,
                    },
                    pressed && { opacity: 0.85 },
                  ]}>
                  <ThemedText
                    variant="bodySmall"
                    weight={active ? '700' : '500'}
                    style={{ color: active ? '#000' : theme.text.primary }}>
                    {label}
                  </ThemedText>
                </Pressable>
              );
            })}
          </View>

          <View style={styles.stageWrap}>
            <View
              ref={stageRef}
              collapsable={false}
              onLayout={handleStageLayout}
              style={[styles.stage, { backgroundColor: theme.background.secondary }]}>
              {mode === 'stacked' ? (
                <View style={styles.stackedFlow}>
                  <LabeledImage uri={imageUrl} label="Anime" accent={themeColor} />
                  <LabeledImage uri={shotUri} label="Your shot" accent={themeColor} />
                </View>
              ) : mode === 'sideBySide' ? (
                <View style={styles.sideFlow}>
                  <View style={styles.sideHalf}>
                    <LabeledImage uri={imageUrl} label="Anime" accent={themeColor} compact />
                  </View>
                  <View style={styles.sideHalf}>
                    <LabeledImage uri={shotUri} label="Your shot" accent={themeColor} compact />
                  </View>
                </View>
              ) : mode === 'overlay' ? (
                <View style={styles.overlayFlow}>
                  <Image source={{ uri: shotUri }} style={styles.fullImage} contentFit="cover" />
                  <Image
                    source={{ uri: imageUrl }}
                    style={[
                      styles.fullImage,
                      StyleSheet.absoluteFillObject,
                      { opacity: overlayOpacity },
                    ]}
                    contentFit="cover"
                  />
                  <View style={styles.overlayControls}>
                    <OpacityBar
                      value={overlayOpacity}
                      onChange={setOverlayOpacity}
                      accent={themeColor}
                    />
                  </View>
                </View>
              ) : (
                <GestureDetector gesture={sliderPan}>
                  <View style={styles.sliderFlow}>
                    <Image source={{ uri: shotUri }} style={styles.fullImage} contentFit="cover" />
                    <Animated.View style={[styles.sliderClip, sliderClipStyle]}>
                      {stagePx.width > 0 ? (
                        <Image
                          source={{ uri: imageUrl }}
                          style={{ width: stagePx.width, height: stagePx.height }}
                          contentFit="cover"
                        />
                      ) : null}
                    </Animated.View>
                    <Animated.View
                      style={[styles.sliderHandle, sliderHandleStyle]}
                      pointerEvents="none">
                      <View style={[styles.sliderKnob, { backgroundColor: themeColor }]}>
                        <Ionicons name="chevron-back" size={12} color="#000" />
                        <Ionicons name="chevron-forward" size={12} color="#000" />
                      </View>
                    </Animated.View>
                    <View style={[styles.sliderHint, styles.sliderHintLeft]}>
                      <ThemedText variant="captionSmall" weight="700" style={{ color: '#fff' }}>
                        Anime
                      </ThemedText>
                    </View>
                    <View style={[styles.sliderHint, styles.sliderHintRight]}>
                      <ThemedText variant="captionSmall" weight="700" style={{ color: '#fff' }}>
                        Yours
                      </ThemedText>
                    </View>
                  </View>
                </GestureDetector>
              )}
            </View>
          </View>

          {sensorSnapshot && positionScore ? (
            <View
              style={[
                styles.analysisCard,
                {
                  backgroundColor: theme.background.secondary,
                  borderColor: theme.glassBorder,
                },
              ]}>
              <View style={styles.analysisHeader}>
                <ThemedText variant="titleMedium" weight="700">
                  Position Lock
                </ThemedText>
                <Ionicons name="navigate" size={14} color={theme.accent} />
              </View>
              {sensorSnapshot.distanceMeters != null && positionScore.position != null ? (
                <AnalysisBar
                  label="Position"
                  value={positionScore.position * 100}
                  rightLabel={`${sensorSnapshot.distanceMeters.toFixed(1)} m`}
                  theme={theme}
                  tone={theme.status.success}
                />
              ) : null}
              {sensorSnapshot.headingDeltaDeg != null && positionScore.heading != null ? (
                <AnalysisBar
                  label="Heading"
                  value={positionScore.heading * 100}
                  rightLabel={`±${Math.round(Math.abs(sensorSnapshot.headingDeltaDeg))}°`}
                  theme={theme}
                  tone={theme.status.info}
                />
              ) : null}
              {sensorSnapshot.tilt != null && positionScore.tilt != null ? (
                <AnalysisBar
                  label="Tilt"
                  value={positionScore.tilt * 100}
                  rightLabel={formatSignedDeg(sensorSnapshot.tilt)}
                  theme={theme}
                  tone={theme.accent}
                />
              ) : null}
            </View>
          ) : null}

          {frameMatch && frameMatch.total != null ? (
            <View
              style={[
                styles.analysisCard,
                {
                  backgroundColor: theme.background.secondary,
                  borderColor: theme.glassBorder,
                },
              ]}>
              <View style={styles.analysisHeader}>
                <ThemedText variant="titleMedium" weight="700">
                  Frame Match
                </ThemedText>
                <Ionicons name="image" size={14} color={theme.accent} />
              </View>
              {frameMatch.histogram != null ? (
                <AnalysisBar
                  label="Histogram"
                  value={frameMatch.histogram * 100}
                  rightLabel={`${Math.round(frameMatch.histogram * 100)}%`}
                  theme={theme}
                  tone={theme.status.success}
                />
              ) : null}
              {frameMatch.edge != null ? (
                <AnalysisBar
                  label="Edge"
                  value={frameMatch.edge * 100}
                  rightLabel={`${Math.round(frameMatch.edge * 100)}%`}
                  theme={theme}
                  tone={theme.status.info}
                />
              ) : null}
              {frameMatch.lighting != null ? (
                <AnalysisBar
                  label="Lighting"
                  value={frameMatch.lighting * 100}
                  rightLabel={`${Math.round(frameMatch.lighting * 100)}%`}
                  theme={theme}
                  tone={theme.accent}
                />
              ) : null}
            </View>
          ) : null}

          {retakeTip ? (
            <View
              style={[
                styles.tipCard,
                { backgroundColor: `${theme.accent}14`, borderColor: `${theme.accent}55` },
              ]}>
              <Ionicons name="bulb-outline" size={16} color={theme.accent} />
              <View style={{ flex: 1 }}>
                <ThemedText variant="captionSmall" weight="700" style={{ color: theme.accent }}>
                  Tips to improve
                </ThemedText>
                <ThemedText variant="bodySmall" tone="secondary" style={{ marginTop: 2 }}>
                  {retakeTip}
                </ThemedText>
              </View>
            </View>
          ) : null}
        </ScrollView>

        <View style={[styles.footer, { paddingBottom: bottomPad(insets) }]}>
          <Pressable
            onPress={handleRetake}
            style={({ pressed }) => [
              styles.footerBtn,
              {
                backgroundColor: theme.background.secondary,
                borderColor: theme.glassBorder,
              },
              pressed && { opacity: 0.85 },
            ]}
            accessibilityRole="button"
            accessibilityLabel="Retake">
            <Ionicons name="refresh" size={18} color={theme.text.primary} />
            <ThemedText variant="bodyMedium" weight="600">
              Retake
            </ThemedText>
          </Pressable>
          <Pressable
            onPress={handleSave}
            disabled={saving || saved}
            style={({ pressed }) => [
              styles.footerBtn,
              {
                backgroundColor: themeColor,
                opacity: saving || saved ? 0.7 : pressed ? 0.88 : 1,
              },
            ]}
            accessibilityRole="button"
            accessibilityLabel="Save to library">
            {saving ? (
              <ActivityIndicator size="small" color="#000" />
            ) : (
              <Ionicons name={saved ? 'checkmark' : 'download'} size={18} color="#000" />
            )}
            <ThemedText variant="bodyMedium" weight="700" style={{ color: '#000' }}>
              {saved ? 'Saved' : 'Save'}
            </ThemedText>
          </Pressable>
        </View>
      </SafeAreaView>
    </GestureHandlerRootView>
  );
}

function LabeledImage({
  uri,
  label,
  accent,
  compact,
}: {
  uri: string;
  label: string;
  accent: string;
  compact?: boolean;
}) {
  return (
    <View style={[styles.labelWrap, compact && { flex: 1 }]}>
      <Image source={{ uri }} style={styles.fullImage} contentFit="cover" />
      <LinearGradient colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.55)']} style={styles.labelGradient} />
      <View style={[styles.labelBadge, { borderColor: accent }]}>
        <View style={[styles.labelDot, { backgroundColor: accent }]} />
        <ThemedText variant="captionSmall" weight="700" style={{ color: '#fff' }}>
          {label}
        </ThemedText>
      </View>
    </View>
  );
}

function AnalysisBar({
  label,
  value,
  rightLabel,
  theme,
  tone,
}: {
  label: string;
  value: number;
  rightLabel: string;
  theme: ThemePalette;
  tone: string;
}) {
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <View style={styles.analysisRow}>
      <View style={styles.analysisLabelRow}>
        <ThemedText variant="bodySmall" weight="600">
          {label}
        </ThemedText>
        <ThemedText variant="bodySmall" weight="700" style={{ color: tone }}>
          {rightLabel}
        </ThemedText>
      </View>
      <View style={[styles.analysisTrack, { backgroundColor: theme.background.tertiary }]}>
        <View style={[styles.analysisFill, { backgroundColor: tone, width: `${clamped}%` }]} />
      </View>
    </View>
  );
}

function OpacityBar({
  value,
  onChange,
  accent,
}: {
  value: number;
  onChange: (v: number) => void;
  accent: string;
}) {
  return (
    <View style={styles.opacityBarRow}>
      {[0.2, 0.4, 0.6, 0.8, 1].map((stop) => {
        const active = Math.abs(value - stop) < 0.05;
        return (
          <Pressable
            key={stop}
            onPress={() => {
              hapticsBridge.selection();
              onChange(stop);
            }}
            style={({ pressed }) => [
              styles.opacityChip,
              {
                backgroundColor: active ? accent : 'rgba(0,0,0,0.55)',
                borderColor: active ? accent : 'rgba(255,255,255,0.25)',
                opacity: pressed ? 0.7 : 1,
              },
            ]}>
            <ThemedText
              variant="captionSmall"
              weight="700"
              style={{ color: active ? '#000' : '#fff' }}>
              {Math.round(stop * 100)}%
            </ThemedText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    height: 52,
    gap: 8,
  },
  headerBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerMid: { flex: 1, gap: 2 },
  scrollContent: {
    paddingBottom: 12,
    gap: 12,
  },
  scoreCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginHorizontal: 16,
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
  },
  invalidBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: 16,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  pillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  pill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: 1,
    gap: 2,
    minWidth: 84,
  },
  overallWrap: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 2,
  },
  analysisCard: {
    marginHorizontal: 16,
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    gap: 10,
  },
  analysisHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  analysisRow: {
    gap: 6,
  },
  analysisLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  analysisTrack: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  analysisFill: {
    height: 6,
    borderRadius: 3,
  },
  tipCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: 16,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
  },
  modeRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 8,
  },
  modeBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 9,
    borderRadius: 999,
    borderWidth: 1,
  },
  stageWrap: {
    paddingHorizontal: 16,
  },
  stage: {
    height: 360,
    borderRadius: 20,
    overflow: 'hidden',
  },
  stackedFlow: { flex: 1, flexDirection: 'column' },
  sideFlow: { flex: 1, flexDirection: 'row' },
  sideHalf: { flex: 1 },
  overlayFlow: { flex: 1 },
  sliderFlow: { flex: 1 },
  labelWrap: { flex: 1, position: 'relative' },
  fullImage: { width: '100%', height: '100%' },
  labelGradient: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 56,
  },
  labelBadge: {
    position: 'absolute',
    left: 10,
    bottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderWidth: 1,
  },
  labelDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  overlayControls: {
    position: 'absolute',
    bottom: 12,
    left: 12,
    right: 12,
  },
  opacityBarRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    gap: 6,
  },
  opacityChip: {
    flex: 1,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: 'center',
  },
  sliderClip: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    overflow: 'hidden',
  },
  sliderHandle: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 3,
    marginLeft: -1.5,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.92)',
  },
  sliderKnob: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: -4,
  },
  sliderHint: {
    position: 'absolute',
    top: 10,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  sliderHintLeft: { left: 10 },
  sliderHintRight: { right: 10 },
  footer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingTop: 14,
    gap: 10,
  },
  footerBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 16,
    borderWidth: 1,
  },
});
