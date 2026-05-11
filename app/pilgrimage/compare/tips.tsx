// Mirrors japanwalker.pen Screen 10 (Photo Composition Tips).
// Pre-camera screen — shows the reference image plus best-shot conditions
// (golden hour, weather, facing direction, recommended distance) and a small
// rule-of-thirds composition note before launching the AR camera.

import { useCallback, useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Radius, Spacing } from '../../../constants/DesignSystem';
import { useTheme, type ThemePalette } from '../../../context/ThemeContext';
import { hapticsBridge } from '../../../modules/haptics/hapticsBridge';
import { ThemedText, readableTextOn } from '../../../components/themed';

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

export default function PhotoTipsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const params = useLocalSearchParams<SearchParams>();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  const accent = params.themeColor || theme.accent;
  const accentFg = readableTextOn(accent);
  const sceneName = params.name || 'Scene';

  const handleStart = useCallback(() => {
    hapticsBridge.success();
    router.replace({
      pathname: '/pilgrimage/compare/[spotId]',
      params: { ...params },
    });
  }, [router, params]);

  const handleAlign = useCallback(() => {
    hapticsBridge.tap();
    router.replace({
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
            style={({ pressed }) => [styles.headerBtn, pressed && { opacity: 0.6 }]}>
            <Ionicons name="chevron-back" size={22} color={theme.text.primary} />
          </Pressable>
          <View style={styles.headerCenter}>
            <ThemedText variant="titleLarge" weight="700">
              拍照建議
            </ThemedText>
            <ThemedText variant="captionSmall" tone="secondary">
              Photo Tips
            </ThemedText>
          </View>
          <Pressable
            onPress={handleAlign}
            hitSlop={14}
            accessibilityRole="button"
            accessibilityLabel="GPS alignment"
            style={({ pressed }) => [styles.headerBtn, pressed && { opacity: 0.6 }]}>
            <Ionicons name="navigate" size={20} color={theme.text.primary} />
          </Pressable>
        </View>

        <ScrollView
          contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 120 }]}
          showsVerticalScrollIndicator={false}>
          <View style={styles.referenceCard}>
            <Image
              source={{ uri: params.imageUrl }}
              style={styles.referenceImage}
              contentFit="cover"
              transition={180}
            />
            <LinearGradient
              colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.78)']}
              style={styles.referenceGradient}
            />
            <View style={[styles.refBadge, { borderColor: accent }]}>
              <View style={[styles.refBadgeDot, { backgroundColor: accent }]} />
              <ThemedText
                variant="captionSmall"
                weight="700"
                style={{ color: '#fff' }}>
                REFERENCE
              </ThemedText>
            </View>
            <View style={styles.refBody}>
              <ThemedText variant="titleSmall" weight="700" style={{ color: '#fff' }}>
                {sceneName}
              </ThemedText>
              <ThemedText
                variant="captionSmall"
                style={{ color: 'rgba(255,255,255,0.78)' }}>
                {params.ep ? `原作場景 · EP${params.ep}` : 'Reference scene'}
              </ThemedText>
            </View>
          </View>

          <SectionHeader title="Best Shot Settings" subtitle="最佳拍攝設定" theme={theme} />
          <View style={styles.grid2}>
            <TipCell
              icon="sunny-outline"
              tone={theme.status.warning}
              theme={theme}
              label="黃昏 Golden Hour"
              value="17:30–18:15"
            />
            <TipCell
              icon="partly-sunny-outline"
              tone={theme.status.info}
              theme={theme}
              label="天氣 Weather"
              value="晴 / 薄雲"
            />
            <TipCell
              icon="compass-outline"
              tone={theme.accent}
              theme={theme}
              label="方向 Direction"
              value="面向北方 N"
            />
            <TipCell
              icon="resize-outline"
              tone={theme.secondary}
              theme={theme}
              label="距離 Distance"
              value="退後 3.2m"
            />
          </View>

          <SectionHeader title="Composition Tips" subtitle="構圖建議" theme={theme} />
          <View style={styles.compoCard}>
            <View style={styles.gridIllustration}>
              <View style={styles.gridIllustrationLine} />
              <View style={[styles.gridIllustrationLine, { top: '66.66%' }]} />
              <View
                style={[styles.gridIllustrationLine, styles.gridIllustrationLineV]}
              />
              <View
                style={[
                  styles.gridIllustrationLine,
                  styles.gridIllustrationLineV,
                  { left: '66.66%' },
                ]}
              />
              {([
                ['33.33%', '33.33%'],
                ['66.66%', '33.33%'],
                ['33.33%', '66.66%'],
                ['66.66%', '66.66%'],
              ] as const).map(([left, top], idx) => (
                <View
                  key={`dot-${idx}`}
                  style={[
                    styles.gridIllustrationDot,
                    {
                      left: left as `${number}%`,
                      top: top as `${number}%`,
                      backgroundColor: idx === 0 || idx === 2 ? accent : theme.text.tertiary,
                    },
                  ]}
                />
              ))}
            </View>
            <View style={{ flex: 1, gap: 4 }}>
              <ThemedText variant="bodyMedium" weight="700">
                三分構圖法
              </ThemedText>
              <ThemedText variant="bodySmall" tone="secondary">
                Place the main subject on the right-hand third intersection for
                cinematic balance.
              </ThemedText>
            </View>
          </View>

          <View style={styles.proTip}>
            <Ionicons name="bulb-outline" size={18} color={theme.status.warning} />
            <ThemedText variant="bodySmall" tone="secondary" style={{ flex: 1 }}>
              提示：黃金時段 17:30 後光線最柔和，可拍出原作色溫。
            </ThemedText>
          </View>
        </ScrollView>

        <View style={[styles.footer, { paddingBottom: insets.bottom + 14 }]}>
          <Pressable
            onPress={handleStart}
            accessibilityRole="button"
            accessibilityLabel="Start AR camera"
            style={({ pressed }) => [
              styles.startBtn,
              { backgroundColor: accent, opacity: pressed ? 0.85 : 1 },
            ]}>
            <Ionicons name="camera" size={20} color={accentFg} />
            <ThemedText variant="titleMedium" weight="700" style={{ color: accentFg }}>
              開始拍攝對齊 Start AR Camera
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

function TipCell({
  icon,
  tone,
  theme,
  label,
  value,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  tone: string;
  theme: ThemePalette;
  label: string;
  value: string;
}) {
  const styles = useMemo(() => makeStyles(theme), [theme]);
  return (
    <View style={styles.tipCell}>
      <View style={[styles.tipIcon, { backgroundColor: `${tone}26`, borderColor: `${tone}55` }]}>
        <Ionicons name={icon} size={18} color={tone} />
      </View>
      <ThemedText variant="captionSmall" tone="secondary" weight="600">
        {label}
      </ThemedText>
      <ThemedText variant="bodyMedium" weight="700">
        {value}
      </ThemedText>
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
    headerCenter: {
      flex: 1,
      alignItems: 'center',
      gap: 2,
    },
    scroll: {
      paddingHorizontal: 20,
      gap: 18,
    },
    referenceCard: {
      width: '100%',
      height: 200,
      borderRadius: 18,
      overflow: 'hidden',
      backgroundColor: theme.background.secondary,
    },
    referenceImage: { ...StyleSheet.absoluteFillObject },
    referenceGradient: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      height: 100,
    },
    refBadge: {
      position: 'absolute',
      top: 12,
      left: 12,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 999,
      backgroundColor: 'rgba(0,0,0,0.55)',
      borderWidth: 1,
    },
    refBadgeDot: { width: 6, height: 6, borderRadius: 3 },
    refBody: {
      position: 'absolute',
      left: 14,
      right: 14,
      bottom: 12,
      gap: 2,
    },
    grid2: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 12,
    },
    tipCell: {
      width: '47.5%',
      padding: 14,
      borderRadius: Radius.card,
      backgroundColor: theme.background.secondary,
      borderWidth: 1,
      borderColor: theme.glassBorder,
      gap: 8,
    },
    tipIcon: {
      width: 36,
      height: 36,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
    },
    compoCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
      padding: 14,
      borderRadius: Radius.card,
      backgroundColor: theme.background.secondary,
      borderWidth: 1,
      borderColor: theme.glassBorder,
    },
    gridIllustration: {
      width: 100,
      height: 70,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: theme.glassBorder,
      backgroundColor: theme.background.tertiary,
      position: 'relative',
      overflow: 'hidden',
    },
    gridIllustrationLine: {
      position: 'absolute',
      top: '33.33%',
      left: 0,
      right: 0,
      height: 1,
      backgroundColor: theme.text.tertiary,
      opacity: 0.6,
    },
    gridIllustrationLineV: {
      top: 0,
      bottom: 0,
      left: '33.33%',
      right: undefined,
      width: 1,
      height: undefined,
    },
    gridIllustrationDot: {
      position: 'absolute',
      width: 8,
      height: 8,
      borderRadius: 4,
      marginLeft: -4,
      marginTop: -4,
    },
    proTip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      padding: 12,
      borderRadius: Radius.card,
      backgroundColor: `${theme.status.warning}14`,
      borderWidth: 1,
      borderColor: `${theme.status.warning}55`,
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
