// Mirrors japanwalker.pen Screen 10 (Eqhh9 — Photo Composition Tips).
// Header (back · 拍照建議·Photo Tips with location chip below · help) →
// Hero card (140h anime scene + REFERENCE chip on image + sparkle caption
// row + JP subtitle) → Best Shot Settings 2×2 (icon-tile + tonal subtitle) →
// Composition Tips card (numbered tips with 56×56 rule-of-thirds illustration)
// → Things to Avoid red warn box → Bottom CTA (orange 開啟相機對齊).

import { Fragment, useCallback, useMemo, useState } from 'react';
import { Alert, Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Image } from 'expo-image';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useCameraPermissions } from 'expo-camera';
import { useTheme, type ThemePalette } from '../../../context/ThemeContext';
import { hapticsBridge } from '../../../modules/haptics/hapticsBridge';
import { ThemedText, readableTextOn } from '../../../components/themed';
import { useSceneAnalysis } from '../../../components/pilgrimage/SceneAnalyzer';
import {
  inferAspectRatio,
  inferBestTime,
  inferCameraAngle,
  inferContrast,
  inferDistance,
  inferExposureCompensation,
  inferFocalCell,
  inferMood,
  inferWarnings,
  inferWeather,
  type WarningItem,
} from '../../../libs/services/pilgrimage/scene-analysis';
import { getStringParam } from '../../../libs/utils/route-params';

const WARN_ICONS: Record<WarningItem['icon'], React.ComponentProps<typeof Ionicons>['name']> = {
  sunny: 'sunny',
  moon: 'moon',
  'eye-off': 'eye-off',
  'flash-off': 'flash-off',
  walk: 'walk',
  people: 'people',
  'alert-circle': 'alert-circle',
  contrast: 'contrast',
};

// Shown only when scene analysis is unavailable (offline, decode error). Once
// analysis succeeds we hand control to inferWarnings() which is driven by the
// actual image signals.
const FALLBACK_WARNINGS: WarningItem[] = [
  {
    icon: 'people',
    title: '避開人潮高峰',
    body: 'Crowds peak on weekend afternoons — try early morning or weekdays.',
  },
  {
    icon: 'flash-off',
    title: '勿用閃光燈',
    body: 'Flash washes out the cinematic depth — keep it off.',
  },
];

export default function PhotoTipsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const params = useLocalSearchParams();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  const accent = getStringParam(params, 'themeColor') || theme.accent;
  const accentFg = readableTextOn(accent);
  const sceneName = getStringParam(params, 'name') || 'Scene';
  const ep = getStringParam(params, 'ep');
  const epLabel = ep ? `EP ${ep}` : null;
  const imageUrl = getStringParam(params, 'imageUrl');

  const { status, analysis } = useSceneAnalysis(imageUrl ?? undefined);
  const loading = status === 'loading' || status === 'idle';
  const errored = status === 'error';

  const bestTime = analysis ? inferBestTime(analysis) : null;
  const weather = analysis ? inferWeather(analysis) : null;
  const cameraAngle = analysis ? inferCameraAngle(analysis) : null;
  const distance = analysis ? inferDistance(analysis) : null;
  const focal = analysis ? inferFocalCell(analysis) : null;
  const aspect = analysis ? inferAspectRatio(analysis) : null;
  const contrast = analysis ? inferContrast(analysis) : null;
  const mood = analysis ? inferMood(analysis) : null;
  const exposure = analysis ? inferExposureCompensation(analysis) : null;
  const warnings = analysis ? inferWarnings(analysis) : null;
  const palette = analysis?.palette ?? [];

  const [permission, requestPermission] = useCameraPermissions();
  const [requesting, setRequesting] = useState(false);

  const handleStart = useCallback(async () => {
    // Pre-check camera permission here so the user sees the iOS/Android
    // dialog from an explicit gesture (firing it inside the camera screen's
    // useEffect on mount sometimes silently fails on iOS, which is exactly
    // the "no permission" symptom users report).
    if (requesting) return;
    let current = permission;
    if (!current) {
      // First call ever — useCameraPermissions hasn't settled yet. Trigger
      // requestPermission directly; it returns a fresh status object.
      try {
        setRequesting(true);
        current = await requestPermission();
      } finally {
        setRequesting(false);
      }
    } else if (!current.granted && current.canAskAgain) {
      try {
        setRequesting(true);
        current = await requestPermission();
      } finally {
        setRequesting(false);
      }
    }

    if (!current?.granted) {
      // Permanently denied (or user said no). Offer Settings deep-link
      // instead of navigating into a broken camera screen.
      hapticsBridge.warning();
      Alert.alert(
        '需要相機權限',
        '請到設定 → AniSeekr → 相機開啟存取，才能拍攝聖地對比照。',
        [
          { text: '取消', style: 'cancel' },
          {
            text: '前往設定',
            onPress: () => {
              Linking.openSettings().catch(() => undefined);
            },
          },
        ]
      );
      return;
    }

    hapticsBridge.success();
    router.replace({
      pathname: '/pilgrimage/compare/[spotId]',
      params: { ...params },
    });
  }, [router, params, permission, requestPermission, requesting]);

  const handleHelp = useCallback(() => {
    hapticsBridge.tap();
    // Routes to GPS alignment helper from header — same pre-camera utility.
    router.push({
      pathname: '/pilgrimage/compare/align',
      params: { ...params },
    });
  }, [router, params]);

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <View style={styles.header}>
          <Pressable
            onPress={() => router.back()}
            hitSlop={14}
            accessibilityRole="button"
            accessibilityLabel="Back"
            style={({ pressed }) => [styles.iconBtn, pressed && { opacity: 0.6 }]}>
            <Ionicons name="arrow-back" size={18} color={theme.text.primary} />
          </Pressable>
          <View style={styles.headerCenter}>
            <ThemedText
              variant="titleSmall"
              weight="700"
              style={{ fontSize: 15, textDecorationLine: 'underline' }}>
              拍照建議 · Photo Tips
            </ThemedText>
            <View style={styles.locChip}>
              <Ionicons name="location" size={10} color={accent} />
              <ThemedText
                weight="500"
                style={{ color: theme.text.tertiary, fontSize: 10 }}>
                {sceneName}
              </ThemedText>
            </View>
          </View>
          <Pressable
            onPress={handleHelp}
            hitSlop={14}
            accessibilityRole="button"
            accessibilityLabel="Help / GPS alignment"
            style={({ pressed }) => [styles.iconBtn, pressed && { opacity: 0.6 }]}>
            <Ionicons name="help" size={18} color={theme.text.primary} />
          </Pressable>
        </View>

        <ScrollView
          contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 120 }]}
          showsVerticalScrollIndicator={false}>
          {/* Hero card */}
          <View style={styles.heroCard}>
            <View style={styles.heroImageWrap}>
              {imageUrl ? (
                <Image
                  source={{ uri: imageUrl }}
                  style={styles.heroImage}
                  contentFit="cover"
                  transition={180}
                />
              ) : null}
              <View style={styles.referenceChip}>
                <Ionicons name="film" size={12} color={theme.status.warning} />
                <ThemedText
                  weight="700"
                  style={{
                    color: theme.status.warning,
                    fontSize: 9,
                    letterSpacing: 1,
                  }}>
                  REFERENCE
                </ThemedText>
              </View>
            </View>
            <View style={styles.heroCaption}>
              <View style={styles.captionRow}>
                <Ionicons name="sparkles" size={14} color={accent} />
                <ThemedText variant="bodySmall" weight="600">
                  {epLabel ? `原作場景 · ${epLabel}` : '原作場景'}
                </ThemedText>
              </View>
              <ThemedText
                variant="captionSmall"
                style={{
                  color: theme.text.tertiary,
                  fontSize: 11,
                  lineHeight: 16,
                }}>
                {sceneName}
              </ThemedText>
              {palette.length > 0 ? (
                <View style={styles.paletteRow}>
                  <ThemedText
                    weight="600"
                    style={{
                      color: theme.text.tertiary,
                      fontSize: 9,
                      letterSpacing: 1,
                    }}>
                    PALETTE
                  </ThemedText>
                  <View style={styles.paletteDots}>
                    {palette.map((hex) => (
                      <View
                        key={hex}
                        style={[
                          styles.paletteDot,
                          {
                            backgroundColor: hex,
                            borderColor: theme.glassBorder,
                          },
                        ]}
                      />
                    ))}
                  </View>
                  {mood ? (
                    <ThemedText
                      weight="500"
                      style={{
                        color: theme.text.secondary,
                        fontSize: 10,
                      }}>
                      · {mood.jp}
                    </ThemedText>
                  ) : null}
                </View>
              ) : null}
            </View>
          </View>

          {/* Best Shot Settings */}
          <SectionHeader
            iconName="locate"
            iconColor={theme.status.warning}
            title="Best Shot Settings"
            subtitle="最佳拍攝條件"
            theme={theme}
          />
          <View style={styles.grid2}>
            <TipTile
              icon="sunny"
              tone={theme.status.warning}
              theme={theme}
              label="Best Time"
              {...tileState(loading, errored, bestTime, (d) => ({
                value: d.jp,
                subtitle: d.range,
              }))}
            />
            <TipTile
              icon="partly-sunny"
              tone={theme.status.info}
              theme={theme}
              label="Weather"
              {...tileState(loading, errored, weather, (d) => ({
                value: d.jp,
                subtitle: d.en,
              }))}
            />
            <TipTile
              icon="compass"
              tone={theme.secondary}
              theme={theme}
              label="Camera Angle"
              {...tileState(loading, errored, cameraAngle, (d) => ({
                value: d.jp,
                subtitle: `${d.en} · ${d.light}`,
              }))}
            />
            <TipTile
              icon="resize"
              tone={theme.status.success}
              theme={theme}
              label="Distance"
              {...tileState(loading, errored, distance, (d) => ({
                value: d.jp,
                subtitle: d.en,
              }))}
            />
          </View>

          {/* Composition Tips */}
          <SectionHeader
            iconName="camera"
            iconColor={theme.status.warning}
            title="Composition Tips"
            subtitle="構圖建議"
            theme={theme}
          />
          <View style={styles.tipsList}>
            <CompoTipRow
              number={1}
              accent={accent}
              accentFg={accentFg}
              theme={theme}
              title={focal ? `主體放在${focal.jp}` : '使用三分構圖法'}
              body={
                focal
                  ? `Anchor the subject at the ${focal.en} third-line intersection.`
                  : 'Align the main subject with a third-line intersection for cinematic balance.'
              }
              variant="thirds"
              focalLeftPct={focal?.leftPct}
              focalTopPct={focal?.topPct}
            />
            <View style={styles.tipDivider} />
            <CompoTipRow
              number={2}
              accent={accent}
              accentFg={accentFg}
              theme={theme}
              title="保持原作視角"
              body={
                cameraAngle
                  ? `Match the anime — ${cameraAngle.en.toLowerCase()} shot, ${cameraAngle.light.toLowerCase()}.`
                  : 'Match the camera height and tilt in the reference frame.'
              }
              variant="angle"
            />
            <View style={styles.tipDivider} />
            <CompoTipRow
              number={3}
              accent={accent}
              accentFg={accentFg}
              theme={theme}
              title={
                aspect ? `建議比例 ${aspect.ratio}` : '包含主體標誌'
              }
              body={
                aspect && contrast
                  ? `${aspect.en} · ${contrast.en.toLowerCase()}${exposure && exposure.ev !== '0' ? ` · suggest ${exposure.ev} EV` : ''}.`
                  : 'Keep the recognisable landmark and its surrounding edges inside the frame.'
              }
              variant="frame"
            />
          </View>

          {/* Things to Avoid */}
          <SectionHeader
            iconName="warning"
            iconColor={theme.status.error}
            title="Things to Avoid"
            subtitle="注意事項"
            theme={theme}
          />
          <View style={styles.warnBox}>
            {(warnings ?? FALLBACK_WARNINGS).map((w, i, arr) => (
              <Fragment key={`${w.icon}-${i}`}>
                {i > 0 ? <View style={styles.warnDivider} /> : null}
                <WarnRow
                  icon={WARN_ICONS[w.icon]}
                  theme={theme}
                  title={w.title}
                  body={w.body}
                />
                {i === arr.length - 1 ? null : null}
              </Fragment>
            ))}
          </View>
        </ScrollView>

        <View
          style={[
            styles.footer,
            {
              paddingBottom: insets.bottom + 14,
              borderTopColor: theme.glassBorder,
              backgroundColor: `${theme.background.primary}F0`,
            },
          ]}>
          <Pressable
            onPress={handleStart}
            accessibilityRole="button"
            accessibilityLabel="Start AR camera"
            style={({ pressed }) => [
              styles.startBtn,
              { backgroundColor: accent, opacity: pressed ? 0.9 : 1 },
            ]}>
            <Ionicons name="camera" size={20} color={accentFg} />
            <View style={{ alignItems: 'center', gap: 1 }}>
              <ThemedText
                weight="700"
                style={{ color: accentFg, fontSize: 14 }}>
                開啟相機對齊
              </ThemedText>
              <ThemedText
                weight="600"
                style={{
                  color: `${accentFg}99`,
                  fontSize: 10,
                  letterSpacing: 0.6,
                }}>
                Start AR Camera
              </ThemedText>
            </View>
          </Pressable>
        </View>
      </SafeAreaView>
    </View>
  );
}

function tileState<T>(
  loading: boolean,
  errored: boolean,
  data: T | null,
  ready: (d: T) => { value: string; subtitle: string }
): { value: string; subtitle: string; loading: boolean; muted: boolean } {
  if (loading) {
    return {
      value: '分析中…',
      subtitle: 'Analyzing scene…',
      loading: true,
      muted: false,
    };
  }
  if (errored || !data) {
    return {
      value: '無法分析',
      subtitle: 'Image unavailable',
      loading: false,
      muted: true,
    };
  }
  return { ...ready(data), loading: false, muted: false };
}

function SectionHeader({
  iconName,
  iconColor,
  title,
  subtitle,
  theme,
}: {
  iconName: React.ComponentProps<typeof Ionicons>['name'];
  iconColor: string;
  title: string;
  subtitle?: string;
  theme: ThemePalette;
}) {
  return (
    <View style={sectionHeaderStyles.wrap}>
      <View style={sectionHeaderStyles.left}>
        <Ionicons name={iconName} size={16} color={iconColor} />
        <ThemedText weight="700" style={{ fontSize: 14 }}>
          {title}
        </ThemedText>
      </View>
      {subtitle ? (
        <ThemedText
          weight="500"
          style={{ color: theme.text.tertiary, fontSize: 11 }}>
          {subtitle}
        </ThemedText>
      ) : null}
    </View>
  );
}

const sectionHeaderStyles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  left: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
});

function TipTile({
  icon,
  tone,
  theme,
  label,
  value,
  subtitle,
  loading,
  muted,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  tone: string;
  theme: ThemePalette;
  label: string;
  value: string;
  subtitle: string;
  loading?: boolean;
  muted?: boolean;
}) {
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const subtitleColor = muted ? theme.text.tertiary : tone;
  const valueColor = muted ? theme.text.secondary : theme.text.primary;
  return (
    <View style={[styles.tile, loading && { opacity: 0.65 }]}>
      <View style={styles.tileHead}>
        <View style={[styles.tileIcon, { backgroundColor: `${tone}26` }]}>
          <Ionicons name={icon} size={14} color={tone} />
        </View>
        <ThemedText
          weight="600"
          style={{ color: theme.text.secondary, fontSize: 12 }}>
          {label}
        </ThemedText>
      </View>
      <ThemedText weight="700" style={{ fontSize: 16, color: valueColor }}>
        {value}
      </ThemedText>
      <ThemedText weight="500" style={{ color: subtitleColor, fontSize: 11 }}>
        {subtitle}
      </ThemedText>
    </View>
  );
}

function CompoTipRow({
  number,
  accent,
  accentFg,
  theme,
  title,
  body,
  variant,
  focalLeftPct,
  focalTopPct,
}: {
  number: number;
  accent: string;
  accentFg: string;
  theme: ThemePalette;
  title: string;
  body: string;
  variant: 'thirds' | 'angle' | 'frame';
  focalLeftPct?: number;
  focalTopPct?: number;
}) {
  const styles = useMemo(() => makeStyles(theme), [theme]);
  return (
    <View style={styles.tipRow}>
      <View style={styles.tipDiag}>
        <DiagIllustration
          variant={variant}
          accent={accent}
          theme={theme}
          focalLeftPct={focalLeftPct}
          focalTopPct={focalTopPct}
        />
      </View>
      <View style={styles.tipBody}>
        <View style={styles.tipTitleRow}>
          <View style={[styles.numberBadge, { backgroundColor: accent }]}>
            <ThemedText
              weight="700"
              style={{ color: accentFg, fontSize: 11 }}>
              {number}
            </ThemedText>
          </View>
          <ThemedText variant="bodySmall" weight="700">
            {title}
          </ThemedText>
        </View>
        <ThemedText
          variant="captionSmall"
          style={{ color: theme.text.tertiary, lineHeight: 16 }}>
          {body}
        </ThemedText>
      </View>
    </View>
  );
}

function DiagIllustration({
  variant,
  accent,
  theme,
  focalLeftPct,
  focalTopPct,
}: {
  variant: 'thirds' | 'angle' | 'frame';
  accent: string;
  theme: ThemePalette;
  focalLeftPct?: number;
  focalTopPct?: number;
}) {
  const grid = theme.text.tertiary;
  if (variant === 'thirds') {
    // Default to bottom-right intersection if no focal cell supplied.
    const dotLeft = `${focalLeftPct ?? 66.66}%` as `${number}%`;
    const dotTop = `${focalTopPct ?? 66.66}%` as `${number}%`;
    return (
      <View style={diagStyles.box}>
        {/* horizontal lines */}
        <View style={[diagStyles.hLine, { top: '33.33%', backgroundColor: accent, opacity: 0.7 }]} />
        <View style={[diagStyles.hLine, { top: '66.66%', backgroundColor: accent, opacity: 0.7 }]} />
        {/* vertical lines */}
        <View style={[diagStyles.vLine, { left: '33.33%', backgroundColor: accent, opacity: 0.7 }]} />
        <View style={[diagStyles.vLine, { left: '66.66%', backgroundColor: accent, opacity: 0.7 }]} />
        {/* hot dot — placed at the inferred focal intersection */}
        <View
          style={[
            diagStyles.dot,
            {
              left: dotLeft,
              top: dotTop,
              backgroundColor: accent,
              marginLeft: -5,
              marginTop: -5,
              width: 10,
              height: 10,
              borderRadius: 5,
            },
          ]}
        />
      </View>
    );
  }
  if (variant === 'angle') {
    return (
      <View style={diagStyles.box}>
        <View style={[diagStyles.vLine, { left: '50%', backgroundColor: grid, opacity: 0.5 }]} />
        <View
          style={[
            diagStyles.angleLine,
            { backgroundColor: accent },
          ]}
        />
        <View
          style={[
            diagStyles.dot,
            {
              left: 8,
              top: 38,
              backgroundColor: accent,
            },
          ]}
        />
      </View>
    );
  }
  // frame
  return (
    <View style={diagStyles.box}>
      <View style={[diagStyles.frameInner, { borderColor: accent }]} />
      <View
        style={[
          diagStyles.dot,
          { left: '50%', top: '50%', backgroundColor: accent, marginLeft: -4, marginTop: -4 },
        ]}
      />
    </View>
  );
}

const diagStyles = StyleSheet.create({
  box: {
    width: 56,
    height: 56,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
  },
  hLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 1,
  },
  vLine: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 1,
  },
  angleLine: {
    position: 'absolute',
    width: 40,
    height: 1,
    top: 26,
    left: 8,
    transform: [{ rotate: '-20deg' }],
  },
  frameInner: {
    position: 'absolute',
    top: 10,
    left: 10,
    right: 10,
    bottom: 10,
    borderWidth: 1.5,
    borderRadius: 4,
  },
  dot: {
    position: 'absolute',
    width: 8,
    height: 8,
    borderRadius: 4,
  },
});

function WarnRow({
  icon,
  theme,
  title,
  body,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  theme: ThemePalette;
  title: string;
  body: string;
}) {
  const styles = useMemo(() => makeStyles(theme), [theme]);
  return (
    <View style={styles.warnRow}>
      <View style={[styles.warnIcon, { backgroundColor: `${theme.status.error}22` }]}>
        <Ionicons name={icon} size={14} color={theme.status.error} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <ThemedText variant="bodySmall" weight="700">
          {title}
        </ThemedText>
        <ThemedText
          variant="captionSmall"
          style={{ color: theme.text.tertiary, lineHeight: 16 }}>
          {body}
        </ThemedText>
      </View>
    </View>
  );
}

function makeStyles(theme: ThemePalette) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: theme.background.primary },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingTop: 8,
      paddingBottom: 12,
      gap: 12,
    },
    iconBtn: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.background.secondary,
      borderWidth: 1,
      borderColor: theme.glassBorder,
    },
    headerCenter: {
      flex: 1,
      alignItems: 'center',
      gap: 4,
    },
    locChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 10,
      backgroundColor: theme.background.secondary,
      borderWidth: 1,
      borderColor: theme.glassBorder,
    },
    scroll: {
      paddingHorizontal: 16,
      paddingTop: 10,
      gap: 14,
    },
    heroCard: {
      borderRadius: 18,
      overflow: 'hidden',
      backgroundColor: theme.background.secondary,
      borderWidth: 1,
      borderColor: theme.glassBorder,
    },
    heroImageWrap: {
      width: '100%',
      height: 180,
      position: 'relative',
      backgroundColor: theme.background.tertiary,
    },
    heroImage: {
      width: '100%',
      height: '100%',
    },
    referenceChip: {
      position: 'absolute',
      top: 12,
      left: 12,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 9,
      paddingVertical: 5,
      borderRadius: 8,
      backgroundColor: 'rgba(0,0,0,0.7)',
    },
    heroCaption: {
      padding: 14,
      gap: 6,
    },
    captionRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    paletteRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginTop: 6,
    },
    paletteDots: {
      flexDirection: 'row',
      gap: 4,
    },
    paletteDot: {
      width: 12,
      height: 12,
      borderRadius: 6,
      borderWidth: 1,
    },
    grid2: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 10,
    },
    tile: {
      width: '48%',
      padding: 12,
      borderRadius: 14,
      backgroundColor: theme.background.secondary,
      borderWidth: 1,
      borderColor: theme.glassBorder,
      gap: 8,
    },
    tileHead: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    tileIcon: {
      width: 28,
      height: 28,
      borderRadius: 8,
      alignItems: 'center',
      justifyContent: 'center',
    },
    tipsList: {
      padding: 4,
      borderRadius: 14,
      backgroundColor: theme.background.secondary,
      borderWidth: 1,
      borderColor: theme.glassBorder,
    },
    tipRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      padding: 10,
    },
    tipDiag: {
      width: 56,
      height: 56,
    },
    tipBody: {
      flex: 1,
      gap: 4,
    },
    tipTitleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    numberBadge: {
      width: 20,
      height: 20,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
    },
    tipDivider: {
      height: 1,
      backgroundColor: theme.glassBorder,
      marginHorizontal: 10,
    },
    warnBox: {
      borderRadius: 14,
      backgroundColor: `${theme.status.error}10`,
      borderWidth: 1,
      borderColor: `${theme.status.error}40`,
      overflow: 'hidden',
    },
    warnRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      padding: 12,
    },
    warnIcon: {
      width: 28,
      height: 28,
      borderRadius: 8,
      alignItems: 'center',
      justifyContent: 'center',
    },
    warnDivider: {
      height: 1,
      backgroundColor: `${theme.status.error}30`,
    },
    footer: {
      paddingHorizontal: 16,
      paddingTop: 12,
      borderTopWidth: 1,
    },
    startBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 10,
      height: 54,
      borderRadius: 16,
    },
  });
}
