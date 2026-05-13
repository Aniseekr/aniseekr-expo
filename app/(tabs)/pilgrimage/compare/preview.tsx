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
import { useTheme, type ThemePalette } from '../../../../context/ThemeContext';
import { hapticsBridge } from '../../../../modules/haptics/hapticsBridge';
import { ThemedText } from '../../../../components/themed';
import { recordCapture, type SensorSnapshot } from '../../../../libs/services/pilgrimage/captures';
import { getNumberParam, getStringParam } from '../../../../libs/utils/route-params';

// Real-data alignment helpers — inline so this screen has no dependency on
// services that aren't yet in place. See CLAUDE.md Rule 8: numbers shown to
// the user must come from real sensor input, never a hash/seed.
function overallScore(s: SensorSnapshot): number | null {
  const { distanceMeters, headingDeltaDeg, tilt } = s;
  if (distanceMeters == null || headingDeltaDeg == null || tilt == null) return null;
  const pos = Math.max(0, 1 - distanceMeters / 30);
  const head = 1 - Math.abs(headingDeltaDeg) / 180;
  const tlt = Math.max(0, 1 - Math.abs(tilt) / 45);
  return 0.4 * pos + 0.4 * head + 0.2 * tlt;
}

function getRetakeTip(s: SensorSnapshot | null): string | null {
  if (!s) return null;
  if (s.headingDeltaDeg != null && Math.abs(s.headingDeltaDeg) > 15) {
    return s.headingDeltaDeg > 0
      ? '下次站位時可以再向右轉一點，方位會更貼近原圖。'
      : '下次站位時可以再向左轉一點，方位會更貼近原圖。';
  }
  if (s.distanceMeters != null && s.distanceMeters > 20) {
    return '下次可以走近一點再拍，距離越近構圖越接近原圖。';
  }
  if (s.tilt != null && Math.abs(s.tilt) > 10) {
    return s.tilt > 0
      ? '下次手機可以再放平一點，避免地面比例失衡。'
      : '下次手機稍微往下一點，避免天空佔太多畫面。';
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
  const imageUrl = getStringParam(params, 'imageUrl') ?? '';
  const shotUri = getStringParam(params, 'shotUri') ?? '';
  const sceneName = getStringParam(params, 'name') ?? 'Scene';
  const ep = getStringParam(params, 'ep');
  const animeId = getStringParam(params, 'animeId');
  const themeColor = getStringParam(params, 'themeColor') || theme.accent;
  const heading = getNumberParam(params, 'heading');
  const spotLat = getStringParam(params, 'spotLat');
  const spotLng = getStringParam(params, 'spotLng');

  const [mode, setMode] = useState<Mode>('stacked');
  const [overlayOpacity, setOverlayOpacity] = useState(0.5);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [mediaPerm, requestMediaPerm] = MediaLibrary.usePermissions();
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

  const overall = useMemo(
    () => (sensorSnapshot ? overallScore(sensorSnapshot) : null),
    [sensorSnapshot]
  );

  const retakeTip = useMemo(() => getRetakeTip(sensorSnapshot), [sensorSnapshot]);

  const overallTone = useMemo(() => {
    if (overall == null) return theme.accent;
    if (overall >= 0.8) return theme.status.success;
    if (overall >= 0.5) return theme.accent;
    return theme.status.warning;
  }, [overall, theme.accent, theme.status.success, theme.status.warning]);

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
      await recordCapture({
        spotId,
        uri: shotUri,
        compositeUri,
        capturedAt: Date.now(),
        heading: heading ?? undefined,
        sensorSnapshot: sensorSnapshot ?? undefined,
      });
    },
    [spotId, shotUri, heading, sensorSnapshot]
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
      themeColor,
      spotLat: spotLat ?? '',
      spotLng: spotLng ?? '',
    };
    if (overall != null) {
      shareParams.matchScore = String(Math.round(overall * 100));
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
    themeColor,
    spotLat,
    spotLng,
    overall,
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
              對比結果
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
          {sensorSnapshot ? (
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
                  Alignment · 對位回放
                </ThemedText>
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
                        距離 spot
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
                        方位偏移
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
                        水平偏角
                      </ThemedText>
                    </View>
                  ) : null}
                </View>
              </View>
              {overall != null ? (
                <View style={styles.overallWrap}>
                  <ThemedText
                    variant="displayMedium"
                    weight="700"
                    style={{ color: overallTone, lineHeight: 36 }}>
                    {Math.round(overall * 100)}
                  </ThemedText>
                  <ThemedText variant="bodyMedium" weight="700" style={{ color: overallTone }}>
                    %
                  </ThemedText>
                </View>
              ) : null}
            </View>
          ) : null}

          <View style={styles.modeRow}>
            {(['stacked', 'sideBySide', 'overlay', 'slider'] as Mode[]).map((m) => {
              const active = m === mode;
              const label =
                m === 'stacked'
                  ? '上下'
                  : m === 'sideBySide'
                    ? '左右'
                    : m === 'overlay'
                      ? '疊圖'
                      : '滑動';
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
                  <LabeledImage uri={imageUrl} label="原圖 Anime" accent={themeColor} />
                  <LabeledImage uri={shotUri} label="你的拍 Yours" accent={themeColor} />
                </View>
              ) : mode === 'sideBySide' ? (
                <View style={styles.sideFlow}>
                  <View style={styles.sideHalf}>
                    <LabeledImage uri={imageUrl} label="原圖" accent={themeColor} compact />
                  </View>
                  <View style={styles.sideHalf}>
                    <LabeledImage uri={shotUri} label="你的拍" accent={themeColor} compact />
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
                        原圖
                      </ThemedText>
                    </View>
                    <View style={[styles.sliderHint, styles.sliderHintRight]}>
                      <ThemedText variant="captionSmall" weight="700" style={{ color: '#fff' }}>
                        你的拍
                      </ThemedText>
                    </View>
                  </View>
                </GestureDetector>
              )}
            </View>
          </View>

          {sensorSnapshot ? (
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
                  Analysis · 對位細項
                </ThemedText>
                <Ionicons name="sparkles" size={14} color={theme.accent} />
              </View>
              {sensorSnapshot.distanceMeters != null ? (
                <AnalysisBar
                  label="位置 Position"
                  value={Math.max(0, 1 - sensorSnapshot.distanceMeters / 30) * 100}
                  rightLabel={`${sensorSnapshot.distanceMeters.toFixed(1)} m`}
                  theme={theme}
                  tone={theme.status.success}
                />
              ) : null}
              {sensorSnapshot.headingDeltaDeg != null ? (
                <AnalysisBar
                  label="方位 Heading"
                  value={(1 - Math.abs(sensorSnapshot.headingDeltaDeg) / 180) * 100}
                  rightLabel={`±${Math.round(Math.abs(sensorSnapshot.headingDeltaDeg))}°`}
                  theme={theme}
                  tone={theme.status.info}
                />
              ) : null}
              {sensorSnapshot.tilt != null ? (
                <AnalysisBar
                  label="水平 Tilt"
                  value={Math.max(0, 1 - Math.abs(sensorSnapshot.tilt) / 45) * 100}
                  rightLabel={formatSignedDeg(sensorSnapshot.tilt)}
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
                  Tips to improve · 還能更好
                </ThemedText>
                <ThemedText variant="bodySmall" tone="secondary" style={{ marginTop: 2 }}>
                  {retakeTip}
                </ThemedText>
              </View>
            </View>
          ) : null}
        </ScrollView>

        <View style={[styles.footer, { paddingBottom: insets.bottom + 14 }]}>
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
              重拍
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
              {saved ? '已存到相簿' : '存到相簿'}
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
