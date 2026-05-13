// Mirrors japanwalker.pen Screen 13 (Share Comparison Card).
// Builds a branded share image with both the anime reference and the user's
// shot, plus optional badges (match score, location, date). User picks a
// template and we use react-native-view-shot to capture it into a PNG that
// the native share sheet can send.

import { useCallback, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, Share, StyleSheet, Switch, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import * as MediaLibrary from 'expo-media-library';
import { captureRef } from 'react-native-view-shot';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Radius, Spacing } from '../../../../constants/DesignSystem';
import { useTheme, type ThemePalette } from '../../../../context/ThemeContext';
import { hapticsBridge } from '../../../../modules/haptics/hapticsBridge';
import { ThemedText, readableTextOn } from '../../../../components/themed';
import {
  formatShareLocation,
  getShareEpisode,
  getShareMatchScore,
  getShareSceneName,
} from '../../../../libs/services/pilgrimage/share-card';
import { getStringParam } from '../../../../libs/utils/route-params';

type Template = 'polaroid' | 'classic' | 'minimal' | 'comic' | 'manga';

const TEMPLATES: { id: Template; label: string }[] = [
  { id: 'polaroid', label: 'Polaroid' },
  { id: 'classic', label: 'Classic' },
  { id: 'minimal', label: 'Minimal' },
  { id: 'comic', label: 'Comic' },
  { id: 'manga', label: 'Manga' },
];

export default function ShareComparisonScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const params = useLocalSearchParams();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  const accent = getStringParam(params, 'themeColor') || theme.accent;
  const accentFg = readableTextOn(accent);
  const sceneName = getShareSceneName(params);
  const ep = getShareEpisode(params);
  const matchScore = getShareMatchScore(params);
  const locationText = formatShareLocation(params);
  const imageUrl = getStringParam(params, 'imageUrl') ?? '';
  const shotUri = getStringParam(params, 'shotUri') ?? '';

  const [template, setTemplate] = useState<Template>('polaroid');
  const [showScore, setShowScore] = useState(true);
  const [showLocation, setShowLocation] = useState(true);
  const [showDate, setShowDate] = useState(true);

  const cardRef = useRef<View>(null);
  const [mediaPerm, requestMediaPerm] = MediaLibrary.usePermissions();

  const today = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
  }, []);

  const ensureMediaPerm = useCallback(async () => {
    if (mediaPerm?.granted) return true;
    const next = await requestMediaPerm();
    return next.granted;
  }, [mediaPerm, requestMediaPerm]);

  const captureCard = useCallback(async (): Promise<string | null> => {
    if (!cardRef.current) return null;
    try {
      return await captureRef(cardRef.current, {
        format: 'png',
        quality: 0.95,
        result: 'tmpfile',
      });
    } catch (err) {
      console.warn('share snapshot failed', err);
      return null;
    }
  }, []);

  const handleSave = useCallback(async () => {
    hapticsBridge.success();
    const ok = await ensureMediaPerm();
    if (!ok) return;
    const uri = await captureCard();
    if (uri) {
      try {
        await MediaLibrary.saveToLibraryAsync(uri);
      } catch (err) {
        console.warn('save share card failed', err);
      }
    }
  }, [ensureMediaPerm, captureCard]);

  const handleSocialShare = useCallback(
    async (platform?: string) => {
      hapticsBridge.tap();
      const uri = await captureCard();
      if (!uri) return;
      try {
        await Share.share({
          url: uri,
          message: `${sceneName}${ep ? ` · EP ${ep}` : ''} #aniseekr${platform ? ` via ${platform}` : ''}`,
        });
      } catch (err) {
        console.warn('share failed', err);
      }
    },
    [captureCard, sceneName, ep]
  );

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
              分享你的朝聖
            </ThemedText>
            <ThemedText variant="captionSmall" tone="secondary">
              Share
            </ThemedText>
          </View>
          <Pressable
            onPress={handleSave}
            hitSlop={14}
            accessibilityRole="button"
            accessibilityLabel="Save"
            style={({ pressed }) => [styles.headerBtn, pressed && { opacity: 0.6 }]}>
            <Ionicons name="download" size={20} color={theme.text.primary} />
          </Pressable>
        </View>

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 120 }]}
          showsVerticalScrollIndicator={false}>
          <View style={styles.cardWrap}>
            <View
              ref={cardRef}
              collapsable={false}
              style={[
                styles.card,
                {
                  backgroundColor:
                    template === 'minimal' ? theme.background.primary : theme.background.secondary,
                  borderColor: theme.glassBorder,
                },
              ]}>
              <View style={styles.cardHeader}>
                <View>
                  <ThemedText variant="titleMedium" weight="700">
                    {sceneName}
                  </ThemedText>
                  <ThemedText variant="captionSmall" tone="secondary">
                    {ep ? `EP ${ep} · 聖地巡禮` : '聖地巡禮 · Pilgrimage'}
                  </ThemedText>
                </View>
                {showScore && matchScore !== null ? (
                  <View
                    style={[
                      styles.scoreBadge,
                      {
                        backgroundColor: `${theme.status.success}22`,
                        borderColor: theme.status.success,
                      },
                    ]}>
                    <Ionicons name="checkmark-circle" size={12} color={theme.status.success} />
                    <ThemedText
                      variant="captionSmall"
                      weight="700"
                      style={{ color: theme.status.success }}>
                      Match {matchScore}%
                    </ThemedText>
                  </View>
                ) : null}
              </View>

              <View style={styles.cardImages}>
                <View style={styles.cardHalf}>
                  <Image source={{ uri: imageUrl }} style={styles.cardImage} contentFit="cover" />
                  <View style={[styles.cardImageBadge, { borderColor: accent }]}>
                    <View style={[styles.cardBadgeDot, { backgroundColor: accent }]} />
                    <ThemedText variant="captionSmall" weight="700" style={{ color: '#fff' }}>
                      ANIME
                    </ThemedText>
                  </View>
                </View>
                <View style={styles.cardHalf}>
                  <Image source={{ uri: shotUri }} style={styles.cardImage} contentFit="cover" />
                  <View style={[styles.cardImageBadge, { borderColor: theme.status.success }]}>
                    <View
                      style={[styles.cardBadgeDot, { backgroundColor: theme.status.success }]}
                    />
                    <ThemedText variant="captionSmall" weight="700" style={{ color: '#fff' }}>
                      REAL
                    </ThemedText>
                  </View>
                </View>
              </View>

              <View style={styles.cardMetaRow}>
                {showDate ? (
                  <View style={styles.metaCell}>
                    <Ionicons name="calendar-outline" size={12} color={theme.text.secondary} />
                    <ThemedText variant="captionSmall" tone="secondary" weight="600">
                      {today}
                    </ThemedText>
                  </View>
                ) : null}
                {showLocation ? (
                  <View style={styles.metaCell}>
                    <Ionicons
                      name="location"
                      size={12}
                      color={locationText ? theme.accent : theme.text.secondary}
                    />
                    <ThemedText
                      variant="captionSmall"
                      tone={locationText ? undefined : 'secondary'}
                      weight="600"
                      style={locationText ? { color: theme.accent } : undefined}>
                      {locationText ?? 'GPS unavailable'}
                    </ThemedText>
                  </View>
                ) : null}
              </View>

              <View style={[styles.cardFooter, { borderTopColor: theme.glassBorder }]}>
                <View style={[styles.brandDot, { backgroundColor: accent }]}>
                  <Ionicons name="navigate" size={10} color={accentFg} />
                </View>
                <View style={{ flex: 1 }}>
                  <ThemedText variant="bodySmall" weight="700">
                    Japan Walker
                  </ThemedText>
                  <ThemedText variant="captionSmall" tone="secondary">
                    聖地巡禮 · Pilgrimage
                  </ThemedText>
                </View>
                <View
                  style={[
                    styles.qrBox,
                    {
                      backgroundColor: theme.background.tertiary,
                      borderColor: theme.glassBorder,
                    },
                  ]}>
                  <Ionicons name="qr-code" size={28} color={theme.text.secondary} />
                </View>
              </View>
            </View>
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.templateRow}>
            {TEMPLATES.map((t) => {
              const active = t.id === template;
              return (
                <Pressable
                  key={t.id}
                  onPress={() => {
                    hapticsBridge.selection();
                    setTemplate(t.id);
                  }}
                  style={({ pressed }) => [
                    styles.templateChip,
                    {
                      backgroundColor: active ? accent : theme.background.secondary,
                      borderColor: active ? accent : theme.glassBorder,
                      opacity: pressed ? 0.85 : 1,
                    },
                  ]}>
                  <ThemedText
                    variant="bodySmall"
                    weight={active ? '700' : '600'}
                    style={{ color: active ? accentFg : theme.text.primary }}>
                    {t.label}
                  </ThemedText>
                </Pressable>
              );
            })}
          </ScrollView>

          <View style={styles.toggleGroup}>
            <ToggleRow
              icon="trophy-outline"
              tone={theme.status.success}
              label="Show Match Score"
              subtitle="顯示對比分數"
              value={showScore}
              onChange={setShowScore}
              theme={theme}
            />
            <ToggleRow
              icon="location-outline"
              tone={theme.accent}
              label="Show Location"
              subtitle="顯示拍攝座標"
              value={showLocation}
              onChange={setShowLocation}
              theme={theme}
            />
            <ToggleRow
              icon="calendar-outline"
              tone={theme.secondary}
              label="Show Date"
              subtitle="顯示日期"
              value={showDate}
              onChange={setShowDate}
              theme={theme}
            />
          </View>
        </ScrollView>

        <View style={[styles.footer, { paddingBottom: insets.bottom + 14 }]}>
          <View style={styles.socialRow}>
            <SocialBtn
              icon="logo-instagram"
              gradient={['#FFB86A', '#FF4F8F', '#9B3BFF']}
              onPress={() => handleSocialShare('Instagram')}
              accessibilityLabel="Share to Instagram"
            />
            <SocialBtn
              icon="logo-twitter"
              gradient={['#1DA1F2', '#1DA1F2']}
              onPress={() => handleSocialShare('Twitter')}
              accessibilityLabel="Share to Twitter"
            />
            <SocialBtn
              icon="chatbubble-ellipses"
              gradient={['#10D966', '#0BBC55']}
              onPress={() => handleSocialShare('LINE')}
              accessibilityLabel="Share via LINE"
            />
            <SocialBtn
              icon="ellipsis-horizontal"
              gradient={[theme.background.tertiary, theme.background.tertiary]}
              onPress={() => handleSocialShare()}
              accessibilityLabel="More"
            />
          </View>
          <Pressable
            onPress={handleSave}
            accessibilityRole="button"
            accessibilityLabel="Save image"
            style={({ pressed }) => [
              styles.saveBtn,
              { backgroundColor: accent, opacity: pressed ? 0.85 : 1 },
            ]}>
            <Ionicons name="download" size={18} color={accentFg} />
            <ThemedText variant="titleSmall" weight="700" style={{ color: accentFg }}>
              Save 保存
            </ThemedText>
          </Pressable>
        </View>
      </SafeAreaView>
    </View>
  );
}

function ToggleRow({
  icon,
  tone,
  label,
  subtitle,
  value,
  onChange,
  theme,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  tone: string;
  label: string;
  subtitle: string;
  value: boolean;
  onChange: (v: boolean) => void;
  theme: ThemePalette;
}) {
  const styles = useMemo(() => makeStyles(theme), [theme]);
  return (
    <View style={styles.toggleRow}>
      <View style={[styles.toggleIcon, { backgroundColor: `${tone}26`, borderColor: `${tone}55` }]}>
        <Ionicons name={icon} size={16} color={tone} />
      </View>
      <View style={{ flex: 1 }}>
        <ThemedText variant="bodyMedium" weight="600">
          {label}
        </ThemedText>
        <ThemedText variant="captionSmall" tone="secondary">
          {subtitle}
        </ThemedText>
      </View>
      <Switch
        value={value}
        onValueChange={(v) => {
          hapticsBridge.selection();
          onChange(v);
        }}
        trackColor={{ false: theme.background.tertiary, true: theme.accent }}
        thumbColor={theme.text.primary}
      />
    </View>
  );
}

function SocialBtn({
  icon,
  gradient,
  onPress,
  accessibilityLabel,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  gradient: [string, string, ...string[]];
  onPress: () => void;
  accessibilityLabel: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [shareBtnStyles.btn, pressed && { opacity: 0.85 }]}>
      <LinearGradient
        colors={gradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <Ionicons name={icon} size={22} color="#fff" />
    </Pressable>
  );
}

const shareBtnStyles = StyleSheet.create({
  btn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
});

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
      gap: 18,
    },
    cardWrap: {
      alignItems: 'center',
    },
    card: {
      width: '100%',
      borderRadius: 20,
      borderWidth: 1,
      padding: Spacing.md,
      gap: 10,
    },
    cardHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
    },
    scoreBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 999,
      borderWidth: 1,
    },
    cardImages: {
      flexDirection: 'row',
      gap: 8,
    },
    cardHalf: {
      flex: 1,
      aspectRatio: 1,
      borderRadius: 14,
      overflow: 'hidden',
      position: 'relative',
    },
    cardImage: { width: '100%', height: '100%' },
    cardImageBadge: {
      position: 'absolute',
      top: 8,
      left: 8,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 6,
      paddingVertical: 3,
      borderRadius: 999,
      backgroundColor: 'rgba(0,0,0,0.55)',
      borderWidth: 1,
    },
    cardBadgeDot: { width: 5, height: 5, borderRadius: 2.5 },
    cardMetaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
    },
    metaCell: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    cardFooter: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingTop: 10,
      borderTopWidth: 1,
    },
    brandDot: {
      width: 32,
      height: 32,
      borderRadius: 8,
      alignItems: 'center',
      justifyContent: 'center',
    },
    qrBox: {
      width: 44,
      height: 44,
      borderRadius: 8,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
    },
    templateRow: {
      gap: 8,
      paddingRight: 4,
    },
    templateChip: {
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 999,
      borderWidth: 1,
    },
    toggleGroup: {
      borderRadius: Radius.card,
      borderWidth: 1,
      borderColor: theme.glassBorder,
      backgroundColor: theme.background.secondary,
      overflow: 'hidden',
    },
    toggleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      padding: 14,
      borderBottomWidth: 1,
      borderBottomColor: theme.glassBorder,
    },
    toggleIcon: {
      width: 34,
      height: 34,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
    },
    footer: {
      paddingHorizontal: 20,
      paddingTop: 12,
      gap: 12,
      backgroundColor: theme.background.primary,
    },
    socialRow: {
      flexDirection: 'row',
      gap: 12,
    },
    saveBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingVertical: 14,
      borderRadius: 999,
    },
  });
}
