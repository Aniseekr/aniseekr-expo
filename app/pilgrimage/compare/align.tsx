// Mirrors japanwalker.pen Screen 14 (GPS Alignment Helper).
// Pre-camera positioning aid: shows remaining distance to the target spot,
// a magnetometer-driven compass dial, and a checklist of calibration steps
// before launching the AR camera.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Image } from 'expo-image';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Magnetometer } from 'expo-sensors';
import { Radius, Spacing } from '../../../constants/DesignSystem';
import { useTheme, type ThemePalette } from '../../../context/ThemeContext';
import { hapticsBridge } from '../../../modules/haptics/hapticsBridge';
import { ThemedText, readableTextOn } from '../../../components/themed';
import { locationService, type LatLng } from '../../../libs/services/pilgrimage/location-service';

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
  const φ1 = toRad(from.latitude);
  const φ2 = toRad(to.latitude);
  const Δλ = toRad(to.longitude - from.longitude);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x =
    Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  const θ = Math.atan2(y, x);
  return (toDeg(θ) + 360) % 360;
}

function cardinal(deg: number): string {
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  return dirs[Math.round(deg / 45) % 8] ?? 'N';
}

export default function GpsAlignScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const params = useLocalSearchParams<SearchParams>();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  const accent = params.themeColor || theme.accent;
  const accentFg = readableTextOn(accent);
  const sceneName = params.name || 'Scene';
  const targetLat = Number(params.spotLat) || 0;
  const targetLng = Number(params.spotLng) || 0;
  const hasTarget = targetLat !== 0 || targetLng !== 0;

  const [userLocation, setUserLocation] = useState<LatLng | null>(null);
  const [heading, setHeading] = useState<number | null>(null);
  const [accuracy, setAccuracy] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    locationService
      .getCurrentLocation()
      .then((loc) => {
        if (!cancelled && loc) {
          setUserLocation(loc);
          setAccuracy(15); // location-service doesn't expose accuracy; show a conservative default
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let sub: { remove: () => void } | null = null;
    Magnetometer.setUpdateInterval(200);
    sub = Magnetometer.addListener((data) => {
      const angle = Math.atan2(data.y, data.x);
      let deg = (angle * 180) / Math.PI;
      deg = (90 - deg + 360) % 360;
      setHeading(deg);
    });
    return () => {
      sub?.remove();
    };
  }, []);

  const distance = useMemo(() => {
    if (!userLocation || !hasTarget) return null;
    return locationService.getDistanceKm(userLocation, {
      latitude: targetLat,
      longitude: targetLng,
    });
  }, [userLocation, targetLat, targetLng, hasTarget]);

  const targetBearing = useMemo(() => {
    if (!userLocation || !hasTarget) return null;
    return bearingBetween(userLocation, {
      latitude: targetLat,
      longitude: targetLng,
    });
  }, [userLocation, targetLat, targetLng, hasTarget]);

  const headingDelta = useMemo(() => {
    if (heading == null || targetBearing == null) return null;
    let d = targetBearing - heading;
    if (d > 180) d -= 360;
    if (d < -180) d += 360;
    return d;
  }, [heading, targetBearing]);

  const locked = useMemo(
    () =>
      userLocation != null &&
      heading != null &&
      (accuracy ?? Infinity) < 25 &&
      (distance == null || distance < 0.05),
    [userLocation, heading, accuracy, distance]
  );

  const handleStart = useCallback(() => {
    hapticsBridge.success();
    router.replace({
      pathname: '/pilgrimage/compare/[spotId]',
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
            style={({ pressed }) => [styles.headerBtn, pressed && { opacity: 0.6 }]}>
            <Ionicons name="chevron-back" size={22} color={theme.text.primary} />
          </Pressable>
          <View style={styles.headerCenter}>
            <ThemedText variant="titleLarge" weight="700">
              精準對位
            </ThemedText>
            <ThemedText variant="captionSmall" tone="secondary">
              GPS Alignment
            </ThemedText>
          </View>
          <View style={{ width: 36 }} />
        </View>

        <ScrollView
          contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 120 }]}
          showsVerticalScrollIndicator={false}>
          <View style={styles.targetCard}>
            <Image
              source={{ uri: params.imageUrl }}
              style={styles.targetThumb}
              contentFit="cover"
              transition={140}
            />
            <View style={styles.targetBody}>
              <View style={[styles.targetPill, { backgroundColor: `${accent}33` }]}>
                <ThemedText
                  variant="captionSmall"
                  weight="700"
                  style={{ color: accent }}>
                  {params.ep ? `EP ${params.ep}` : 'TARGET'}
                </ThemedText>
              </View>
              <ThemedText variant="titleMedium" weight="700" numberOfLines={2}>
                {sceneName}
              </ThemedText>
              <ThemedText variant="captionSmall" tone="secondary">
                {hasTarget
                  ? `${targetLat.toFixed(4)}, ${targetLng.toFixed(4)}`
                  : 'No GPS data for this spot'}
              </ThemedText>
            </View>
            <View
              style={[
                styles.distanceBadge,
                { backgroundColor: `${theme.accent}22`, borderColor: theme.accent },
              ]}>
              <ThemedText
                variant="titleMedium"
                weight="700"
                style={{ color: theme.accent }}>
                {distance != null ? `${(distance * 1000).toFixed(0)}m` : '—'}
              </ThemedText>
              <ThemedText
                variant="captionSmall"
                weight="600"
                style={{ color: theme.accent }}>
                away
              </ThemedText>
            </View>
          </View>

          <View style={styles.radarCard}>
            <View style={[styles.radarRing, { borderColor: theme.glassBorder }]}>
              <View style={[styles.radarRing, styles.radarRingInner, { borderColor: theme.glassBorder }]} />
              <View style={[styles.radarRing, styles.radarRingInnermost, { borderColor: theme.glassBorder }]} />
              <View style={[styles.radarYou, { backgroundColor: accent, borderColor: theme.background.primary }]}>
                <ThemedText variant="captionSmall" weight="700" style={{ color: accentFg }}>
                  YOU
                </ThemedText>
              </View>
              {headingDelta != null ? (
                <View
                  style={[
                    styles.radarTarget,
                    {
                      backgroundColor: theme.status.warning,
                      transform: [
                        { rotate: `${headingDelta}deg` },
                        { translateY: -86 },
                      ],
                    },
                  ]}>
                  <ThemedText
                    variant="captionSmall"
                    weight="700"
                    style={{ color: '#000' }}>
                    SPOT
                  </ThemedText>
                </View>
              ) : null}
            </View>
            <View style={styles.bearingPill}>
              <Ionicons name="compass" size={12} color={theme.accent} />
              <ThemedText variant="captionSmall" weight="700">
                {heading != null ? `${Math.round(heading)}° ${cardinal(heading)}` : 'Calibrating compass…'}
              </ThemedText>
            </View>
          </View>

          <View style={styles.summaryRow}>
            <SummaryCell
              icon="locate"
              tone={theme.accent}
              theme={theme}
              label="Accuracy"
              value={accuracy != null ? `±${accuracy.toFixed(0)} m` : '—'}
            />
            <SummaryCell
              icon="compass"
              tone={theme.status.info}
              theme={theme}
              label="Compass"
              value={heading != null ? `${Math.round(heading)}°` : '—'}
              hint={heading != null ? cardinal(heading) : undefined}
            />
            <SummaryCell
              icon="trending-up"
              tone={theme.status.success}
              theme={theme}
              label="Altitude"
              value="—"
              hint="Slight elevation"
            />
          </View>

          <SectionHeader title="Calibration Steps" subtitle="對位步驟" theme={theme} />
          <View style={styles.stepList}>
            <StepRow
              done={!!userLocation}
              accent={accent}
              theme={theme}
              title="Enable GPS"
              subtitle="Accuracy ≤ 25 m"
            />
            <StepRow
              done={heading != null}
              accent={accent}
              theme={theme}
              title="Calibrate compass"
              subtitle="Wave the phone in a figure-8 if heading drifts"
            />
            <StepRow
              done={!!(distance != null && distance < 0.05)}
              accent={accent}
              theme={theme}
              title="Walk to the spot"
              subtitle={
                distance != null
                  ? `${(distance * 1000).toFixed(0)} m to target`
                  : 'Move closer to the marked location'
              }
            />
            <StepRow
              done={false}
              accent={accent}
              theme={theme}
              title="Open AR camera"
              subtitle="When you're aligned, launch capture"
            />
          </View>
        </ScrollView>

        <View style={[styles.footer, { paddingBottom: insets.bottom + 14 }]}>
          <Pressable
            onPress={handleStart}
            accessibilityRole="button"
            accessibilityLabel="Open AR camera"
            style={({ pressed }) => [
              styles.startBtn,
              {
                backgroundColor: locked ? accent : `${accent}88`,
                opacity: pressed ? 0.85 : 1,
              },
            ]}>
            <Ionicons name="camera" size={20} color={accentFg} />
            <ThemedText variant="titleMedium" weight="700" style={{ color: accentFg }}>
              開啟 AR 相機對位
            </ThemedText>
          </Pressable>
        </View>
      </SafeAreaView>
    </View>
  );
}

function SectionHeader({
  title,
  subtitle,
  theme,
}: {
  title: string;
  subtitle?: string;
  theme: ThemePalette;
}) {
  const _ = theme;
  return (
    <View style={{ gap: 2 }}>
      <ThemedText variant="titleMedium" weight="700">
        {title}
      </ThemedText>
      {subtitle ? (
        <ThemedText variant="captionSmall" tone="secondary">
          {subtitle}
        </ThemedText>
      ) : null}
    </View>
  );
}

function SummaryCell({
  icon,
  tone,
  theme,
  label,
  value,
  hint,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  tone: string;
  theme: ThemePalette;
  label: string;
  value: string;
  hint?: string;
}) {
  const styles = useMemo(() => makeStyles(theme), [theme]);
  return (
    <View style={styles.summaryCell}>
      <Ionicons name={icon} size={14} color={tone} />
      <ThemedText variant="captionSmall" tone="secondary" weight="600">
        {label}
      </ThemedText>
      <ThemedText variant="titleSmall" weight="700">
        {value}
      </ThemedText>
      {hint ? (
        <ThemedText variant="captionSmall" tone="tertiary">
          {hint}
        </ThemedText>
      ) : null}
    </View>
  );
}

function StepRow({
  done,
  accent,
  theme,
  title,
  subtitle,
}: {
  done: boolean;
  accent: string;
  theme: ThemePalette;
  title: string;
  subtitle: string;
}) {
  const styles = useMemo(() => makeStyles(theme), [theme]);
  return (
    <View style={styles.stepRow}>
      <View
        style={[
          styles.stepIcon,
          {
            backgroundColor: done ? `${accent}26` : theme.background.tertiary,
            borderColor: done ? accent : theme.glassBorder,
          },
        ]}>
        <Ionicons
          name={done ? 'checkmark' : 'ellipse-outline'}
          size={14}
          color={done ? accent : theme.text.tertiary}
        />
      </View>
      <View style={{ flex: 1 }}>
        <ThemedText variant="bodyMedium" weight="600">
          {title}
        </ThemedText>
        <ThemedText variant="captionSmall" tone="secondary">
          {subtitle}
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
      paddingHorizontal: 14,
      paddingVertical: 10,
    },
    headerBtn: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.background.secondary,
      borderWidth: 1,
      borderColor: theme.glassBorder,
    },
    headerCenter: { flex: 1, alignItems: 'center', gap: 2 },
    scroll: {
      paddingHorizontal: 20,
      gap: 16,
    },
    targetCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      padding: 12,
      borderRadius: Radius.card,
      backgroundColor: theme.background.secondary,
      borderWidth: 1,
      borderColor: theme.glassBorder,
    },
    targetThumb: {
      width: 64,
      height: 64,
      borderRadius: 12,
      backgroundColor: theme.background.tertiary,
    },
    targetBody: { flex: 1, gap: 4 },
    targetPill: {
      alignSelf: 'flex-start',
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 6,
    },
    distanceBadge: {
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 12,
      borderWidth: 1,
      alignItems: 'center',
    },
    radarCard: {
      alignItems: 'center',
      padding: 24,
      borderRadius: Radius.card,
      backgroundColor: theme.background.secondary,
      borderWidth: 1,
      borderColor: theme.glassBorder,
      gap: 14,
    },
    radarRing: {
      width: 200,
      height: 200,
      borderRadius: 100,
      borderWidth: 1,
      alignItems: 'center',
      justifyContent: 'center',
      position: 'relative',
    },
    radarRingInner: { width: 140, height: 140, borderRadius: 70, position: 'absolute' },
    radarRingInnermost: { width: 70, height: 70, borderRadius: 35, position: 'absolute' },
    radarYou: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 2,
      position: 'absolute',
    },
    radarTarget: {
      position: 'absolute',
      width: 38,
      height: 24,
      borderRadius: 6,
      alignItems: 'center',
      justifyContent: 'center',
    },
    bearingPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 999,
      backgroundColor: theme.background.tertiary,
      borderWidth: 1,
      borderColor: theme.glassBorder,
    },
    summaryRow: {
      flexDirection: 'row',
      gap: 10,
    },
    summaryCell: {
      flex: 1,
      padding: 12,
      borderRadius: Radius.card,
      backgroundColor: theme.background.secondary,
      borderWidth: 1,
      borderColor: theme.glassBorder,
      gap: 4,
    },
    stepList: { gap: 10 },
    stepRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      padding: 12,
      borderRadius: Radius.card,
      backgroundColor: theme.background.secondary,
      borderWidth: 1,
      borderColor: theme.glassBorder,
    },
    stepIcon: {
      width: 30,
      height: 30,
      borderRadius: 15,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
    },
    footer: {
      paddingHorizontal: 20,
      paddingTop: 12,
      backgroundColor: theme.background.primary,
    },
    startBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 10,
      paddingVertical: 16,
      borderRadius: 999,
    },
  });
}
