// Builds a branded share image with both the anime reference and the user's
// shot. The user picks a template (visual style) and ratio (target platform);
// react-native-view-shot captures the rendered card into a PNG that the
// platform-specific share intent (or the OS share sheet) delivers.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, View, useWindowDimensions } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import * as MediaLibrary from 'expo-media-library';
import { captureRef } from 'react-native-view-shot';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Radius, bottomPad } from '../../../../constants/DesignSystem';
import { useTheme, type ThemePalette } from '../../../../context/ThemeContext';
import { hapticsBridge } from '../../../../modules/haptics/hapticsBridge';
import { ThemedText, readableTextOn } from '../../../../components/themed';
import {
  formatShareLocation,
  getShareEpisode,
  getShareFrameValid,
  getShareMatchScore,
  getShareSceneName,
} from '../../../../libs/services/pilgrimage/share-card';
import { getNumberParam, getStringParam } from '../../../../libs/utils/route-params';
import {
  ShareCard,
  SHARE_TEMPLATES,
  SHARE_RATIOS,
  ratioToAspect,
  type ShareRatio,
  type ShareTemplate,
} from '../../../../components/pilgrimage/ShareCard';
import { ShareComposerControls } from '../../../../components/pilgrimage/ShareComposerControls';
import { CropSheet } from '../../../../components/pilgrimage/CropSheet';
import { CornerPinSheet } from '../../../../components/pilgrimage/CornerPinSheet';
import {
  getExportDimensions,
  normalizeWatermarkText,
  type ExportResolution,
  type WatermarkFontId,
  type WatermarkPosition,
} from '../../../../libs/services/pilgrimage/share-composer';
import {
  getFilterMatrix,
  IDENTITY_COLOR_MATRIX,
  type FilterPresetId,
} from '../../../../libs/services/pilgrimage/share-filters';
import { loadAutoColorMatrix } from '../../../../libs/services/pilgrimage/share-auto-match';
import {
  tiltCorrectionTransform,
  type RNPerspectiveTransform,
} from '../../../../libs/services/pilgrimage/share-perspective';
import {
  buildShareCaption,
  saveShareImage,
  shareSavedImage,
  shareToInstagram,
  shareToLine,
  shareToSystem,
  shareToTwitter,
  type ShareIntentResult,
  type SharePlatform,
} from '../../../../libs/services/pilgrimage/share-intents';

export default function ShareComparisonScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const params = useLocalSearchParams();
  const { width: winW } = useWindowDimensions();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  const accent = getStringParam(params, 'themeColor') || theme.accent;
  const accentFg = readableTextOn(accent);
  const sceneName = getShareSceneName(params);
  const animeTitle = getStringParam(params, 'animeTitle');
  const ep = getShareEpisode(params);
  const matchScore = getShareMatchScore(params);
  const frameValid = getShareFrameValid(params);
  const locationText = formatShareLocation(params);
  const imageUrl = getStringParam(params, 'imageUrl') ?? '';
  const shotUri = getStringParam(params, 'shotUri') ?? '';

  const [template, setTemplate] = useState<ShareTemplate>('polaroid');
  const [ratio, setRatio] = useState<ShareRatio>('1:1');
  const [showScore, setShowScore] = useState(true);
  const [showLocation, setShowLocation] = useState(true);
  const [showDate, setShowDate] = useState(true);
  const [toast, setToast] = useState<string | null>(null);
  // Composer state — Track A (background color, image swap, watermark, export resolution).
  const [swapOrder, setSwapOrder] = useState(false);
  const [customBg, setCustomBg] = useState<string | null>(null);
  const [watermarkInput, setWatermarkInput] = useState('');
  const [watermarkPosition, setWatermarkPosition] = useState<WatermarkPosition>('bottomRight');
  const [watermarkOpacity, setWatermarkOpacity] = useState(0.85);
  const [watermarkColor, setWatermarkColor] = useState<string | null>(null);
  const [watermarkFont, setWatermarkFont] = useState<WatermarkFontId>('system');
  const [exportResolution, setExportResolution] = useState<ExportResolution>('1080p');

  const watermarkText = useMemo(() => normalizeWatermarkText(watermarkInput), [watermarkInput]);
  const exportDims = useMemo(
    () => getExportDimensions(ratio, exportResolution),
    [ratio, exportResolution]
  );

  // Filter + crop state (Track B). `croppedShotUri` overrides the route-param
  // shot when the user applies a crop; resetting it falls back to the original.
  const [filterPreset, setFilterPreset] = useState<FilterPresetId>('none');
  const [filterIntensity, setFilterIntensity] = useState(0.7);
  const [croppedShotUri, setCroppedShotUri] = useState<string | null>(null);
  const [cropOpen, setCropOpen] = useState(false);

  const presetMatrix = useMemo(
    () => (filterPreset === 'none' ? null : getFilterMatrix(filterPreset, filterIntensity)),
    [filterPreset, filterIntensity]
  );
  const effectiveShotUri = croppedShotUri ?? shotUri;

  // Track C #5 — auto color match.
  const [autoMatchEnabled, setAutoMatchEnabled] = useState(false);
  const [autoMatchMatrix, setAutoMatchMatrix] = useState<number[] | null>(null);
  const [autoMatchLoading, setAutoMatchLoading] = useState(false);

  useEffect(() => {
    if (!autoMatchEnabled || !imageUrl || !effectiveShotUri) {
      setAutoMatchMatrix(null);
      return;
    }
    let cancelled = false;
    setAutoMatchLoading(true);
    loadAutoColorMatrix(imageUrl, effectiveShotUri)
      .then((res) => {
        if (cancelled) return;
        // Compare by VALUE — applyAutoColorMatrix returns a fresh identity array
        // on no-data, so a reference check would never null out and an identity
        // matrix would silently override the user's chosen preset filter.
        const isIdentity = res.matrix.every((v, i) => v === IDENTITY_COLOR_MATRIX[i]);
        setAutoMatchMatrix(isIdentity ? null : res.matrix);
      })
      .catch(() => {
        if (!cancelled) setAutoMatchMatrix(null);
      })
      .finally(() => {
        if (!cancelled) setAutoMatchLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [autoMatchEnabled, imageUrl, effectiveShotUri]);

  // Track C #8 — auto perspective from capture sensors + manual 4-corner warp.
  // `tilt`/`headingDeltaDeg` are forwarded by preview.tsx from the shot's sensor
  // snapshot; the toggle stays disabled until both are present.
  const tiltDeg = getNumberParam(params, 'tilt');
  const headingDeltaDeg = getNumberParam(params, 'headingDeltaDeg');
  const autoWarpAvailable = tiltDeg !== null && headingDeltaDeg !== null;
  const [autoWarpEnabled, setAutoWarpEnabled] = useState(false);
  const [manualWarpMatrix, setManualWarpMatrix] = useState<number[] | null>(null);
  const [warpOpen, setWarpOpen] = useState(false);
  const perspectiveTransform: RNPerspectiveTransform = useMemo(() => {
    // Manual warp wins when present — it's an explicit user override.
    if (manualWarpMatrix) return [{ matrix: manualWarpMatrix }];
    if (autoWarpEnabled) return tiltCorrectionTransform({ tiltDeg, headingDeltaDeg });
    return [];
  }, [manualWarpMatrix, autoWarpEnabled, tiltDeg, headingDeltaDeg]);

  // Final matrix priority: auto match (when ready) overrides preset filter.
  const filterMatrix = autoMatchEnabled && autoMatchMatrix ? autoMatchMatrix : presetMatrix;

  const cardRef = useRef<View>(null);
  const [mediaPerm, requestMediaPerm] = MediaLibrary.usePermissions({
    granularPermissions: ['photo'],
  });

  const today = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
  }, []);

  const cardWidth = Math.min(winW - 32, 420);
  const cardAspect = ratioToAspect(ratio);
  const cardHeight = cardWidth / cardAspect;

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
        width: exportDims.width,
        height: exportDims.height,
      });
    } catch (err) {
      console.warn('share snapshot failed', err);
      return null;
    }
  }, [exportDims.width, exportDims.height]);

  const flashToast = useCallback((text: string) => {
    setToast(text);
    setTimeout(() => setToast(null), 1800);
  }, []);

  const handleSave = useCallback(async () => {
    hapticsBridge.success();
    const ok = await ensureMediaPerm();
    if (!ok) {
      flashToast('Media access denied');
      return;
    }
    const saved = await saveShareImage({
      captureImage: captureCard,
      saveImage: MediaLibrary.saveToLibraryAsync,
    });
    if (saved.status === 'capture-failed') {
      flashToast('Capture failed');
      return;
    }
    if (saved.status === 'save-failed') {
      flashToast('Save failed');
      return;
    }
    flashToast('Saved to camera roll');
  }, [ensureMediaPerm, captureCard, flashToast]);

  const performShare = useCallback(
    async (platform: SharePlatform) => {
      hapticsBridge.tap();
      const ok = await ensureMediaPerm();
      if (!ok) {
        flashToast('Media access denied');
        return;
      }
      const caption = buildShareCaption({
        sceneName,
        animeTitle,
        episode: ep,
        matchScore,
        locationText,
      });
      const savedShare = await shareSavedImage({
        captureImage: captureCard,
        saveImage: MediaLibrary.saveToLibraryAsync,
        shareImage: async (uri) => {
          if (platform === 'instagram') {
            return shareToInstagram({ imageUri: uri, caption });
          }
          if (platform === 'twitter') {
            return shareToTwitter({ imageUri: uri, caption });
          }
          if (platform === 'line') {
            return shareToLine({ imageUri: uri, caption });
          }
          return shareToSystem({ imageUri: uri, caption });
        },
      });
      if (savedShare.status !== 'shared') {
        flashToast(savedShare.status === 'capture-failed' ? 'Capture failed' : 'Save failed');
        return;
      }
      const result = savedShare.result;
      const toastText = describeShareResult(result);
      if (toastText) flashToast(toastText);
    },
    [ensureMediaPerm, captureCard, sceneName, animeTitle, ep, matchScore, locationText, flashToast]
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
              Share Your Pilgrimage
            </ThemedText>
            <ThemedText variant="captionSmall" tone="secondary">
              Share to social
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
          contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 140 }]}
          showsVerticalScrollIndicator={false}>
          <View style={styles.cardWrap}>
            <View style={[styles.cardShadow, { width: cardWidth, height: cardHeight }]}>
              <ShareCard
                ref={cardRef}
                template={template}
                ratio={ratio}
                width={cardWidth}
                imageUrl={imageUrl}
                shotUri={effectiveShotUri}
                sceneName={sceneName}
                animeTitle={animeTitle}
                episode={ep}
                matchScore={showScore ? matchScore : null}
                frameValid={frameValid}
                locationText={showLocation ? locationText : null}
                date={today}
                accent={accent}
                theme={theme}
                showScore={showScore}
                showLocation={showLocation}
                showDate={showDate}
                swapOrder={swapOrder}
                customBg={customBg}
                watermarkText={watermarkText}
                watermarkPosition={watermarkPosition}
                watermarkOpacity={watermarkOpacity}
                watermarkColor={watermarkColor}
                watermarkFont={watermarkFont}
                shotFilterMatrix={filterMatrix}
                shotPerspectiveTransform={perspectiveTransform}
              />
            </View>
          </View>

          <View style={styles.ratioRow}>
            {SHARE_RATIOS.map((r) => {
              const active = r.id === ratio;
              return (
                <Pressable
                  key={r.id}
                  onPress={() => {
                    hapticsBridge.selection();
                    setRatio(r.id);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={`Aspect ratio ${r.label} (${r.hint})`}
                  accessibilityState={{ selected: active }}
                  style={({ pressed }) => [
                    styles.ratioChip,
                    {
                      backgroundColor: active ? accent : theme.background.secondary,
                      borderColor: active ? accent : theme.glassBorder,
                      opacity: pressed ? 0.85 : 1,
                    },
                  ]}>
                  <ThemedText
                    variant="bodySmall"
                    weight="700"
                    style={{ color: active ? accentFg : theme.text.primary }}>
                    {r.label}
                  </ThemedText>
                  <ThemedText
                    variant="captionSmall"
                    weight="600"
                    style={{
                      color: active ? accentFg : theme.text.secondary,
                      opacity: 0.85,
                    }}>
                    {r.hint}
                  </ThemedText>
                </Pressable>
              );
            })}
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.templateRow}>
            {SHARE_TEMPLATES.map((t) => {
              const active = t.id === template;
              return (
                <Pressable
                  key={t.id}
                  onPress={() => {
                    hapticsBridge.selection();
                    setTemplate(t.id);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={`Template ${t.label}`}
                  accessibilityState={{ selected: active }}
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
                    weight="700"
                    style={{ color: active ? accentFg : theme.text.primary }}>
                    {t.emoji} {t.label}
                  </ThemedText>
                </Pressable>
              );
            })}
          </ScrollView>

          <ShareComposerControls
            theme={theme}
            accent={accent}
            swapOrder={swapOrder}
            onSwapOrderChange={setSwapOrder}
            customBg={customBg}
            onCustomBgChange={setCustomBg}
            watermarkInput={watermarkInput}
            onWatermarkInputChange={setWatermarkInput}
            watermarkPosition={watermarkPosition}
            onWatermarkPositionChange={setWatermarkPosition}
            watermarkOpacity={watermarkOpacity}
            onWatermarkOpacityChange={setWatermarkOpacity}
            watermarkColor={watermarkColor}
            onWatermarkColorChange={setWatermarkColor}
            watermarkFont={watermarkFont}
            onWatermarkFontChange={setWatermarkFont}
            exportResolution={exportResolution}
            onExportResolutionChange={setExportResolution}
            filterPreset={filterPreset}
            onFilterPresetChange={setFilterPreset}
            filterIntensity={filterIntensity}
            onFilterIntensityChange={setFilterIntensity}
            onOpenCrop={() => setCropOpen(true)}
            cropApplied={!!croppedShotUri}
            autoMatchEnabled={autoMatchEnabled}
            autoMatchLoading={autoMatchLoading}
            autoMatchAvailable={!!(imageUrl && effectiveShotUri)}
            onAutoMatchChange={setAutoMatchEnabled}
            autoWarpEnabled={autoWarpEnabled}
            autoWarpAvailable={autoWarpAvailable}
            onAutoWarpChange={setAutoWarpEnabled}
            manualWarpApplied={!!manualWarpMatrix}
            onOpenManualWarp={() => setWarpOpen(true)}
            onResetManualWarp={() => setManualWarpMatrix(null)}
          />

          <View style={styles.toggleGroup}>
            <ToggleRow
              icon="trophy-outline"
              tone={theme.status.success}
              label="Show Match Score"
              subtitle="Include comparison score"
              value={showScore}
              onChange={setShowScore}
              theme={theme}
            />
            <ToggleRow
              icon="location-outline"
              tone={theme.accent}
              label="Show Location"
              subtitle="Include capture coordinates"
              value={showLocation}
              onChange={setShowLocation}
              theme={theme}
            />
            <ToggleRow
              icon="calendar-outline"
              tone={theme.secondary}
              label="Show Date"
              subtitle="Include date"
              value={showDate}
              onChange={setShowDate}
              theme={theme}
            />
          </View>
        </ScrollView>

        <View style={[styles.footer, { paddingBottom: bottomPad(insets) }]}>
          <View style={styles.socialRow}>
            <SocialBtn
              icon="logo-instagram"
              label="IG"
              gradient={['#FFB86A', '#FF4F8F', '#9B3BFF']}
              onPress={() => performShare('instagram')}
              accessibilityLabel="Share to Instagram"
            />
            <SocialBtn
              icon="logo-twitter"
              label="X"
              gradient={['#1DA1F2', '#0E72B5']}
              onPress={() => performShare('twitter')}
              accessibilityLabel="Share to X/Twitter"
            />
            <SocialBtn
              icon="chatbubble-ellipses"
              label="LINE"
              gradient={['#10D966', '#0BBC55']}
              onPress={() => performShare('line')}
              accessibilityLabel="Share via LINE"
            />
            <SocialBtn
              icon="ellipsis-horizontal"
              label="More"
              gradient={[theme.background.tertiary, theme.background.tertiary]}
              onPress={() => performShare('system')}
              accessibilityLabel="More share options"
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
              Save to Camera Roll
            </ThemedText>
          </Pressable>
        </View>

        {toast ? (
          <View pointerEvents="none" style={[styles.toastWrap, { bottom: insets.bottom + 168 }]}>
            <View
              style={[
                styles.toast,
                { backgroundColor: theme.background.tertiary, borderColor: theme.glassBorder },
              ]}>
              <ThemedText variant="bodySmall" weight="700">
                {toast}
              </ThemedText>
            </View>
          </View>
        ) : null}
      </SafeAreaView>

      <CropSheet
        visible={cropOpen}
        sourceUri={shotUri}
        referenceUri={imageUrl}
        onCancel={() => setCropOpen(false)}
        onApply={(uri) => {
          setCroppedShotUri(uri === shotUri ? null : uri);
          setCropOpen(false);
          flashToast(uri === shotUri ? 'Crop reset' : 'Cropped');
        }}
      />

      <CornerPinSheet
        visible={warpOpen}
        sourceUri={effectiveShotUri}
        onCancel={() => setWarpOpen(false)}
        onApply={(matrix) => {
          setManualWarpMatrix(matrix);
          setWarpOpen(false);
          flashToast(matrix ? 'Warp applied' : 'Warp reset');
        }}
      />
    </View>
  );
}

function describeShareResult(result: ShareIntentResult): string | null {
  if (result.delivered === 'failed') return 'Share cancelled · Image saved';
  if (result.platform === 'instagram') {
    return result.captionCopied
      ? 'Image saved · Instagram opened · Caption copied'
      : 'Image saved · Instagram opened';
  }
  if (result.platform === 'twitter') {
    return result.captionCopied
      ? 'Image saved · Share to X · Caption copied'
      : 'Image saved · Share to X';
  }
  if (result.platform === 'line') {
    return result.captionCopied
      ? 'Image saved · Share to LINE · Caption copied'
      : 'Image saved · Share to LINE';
  }
  return null;
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
  label,
  gradient,
  onPress,
  accessibilityLabel,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
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
      <Ionicons name={icon} size={20} color="#fff" />
      <ThemedText
        variant="captionSmall"
        weight="700"
        style={{ color: '#fff', marginTop: 2, letterSpacing: 0.5 }}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

const shareBtnStyles = StyleSheet.create({
  btn: {
    flex: 1,
    height: 56,
    borderRadius: 16,
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
      paddingHorizontal: 16,
      gap: 18,
    },
    cardWrap: {
      alignItems: 'center',
    },
    cardShadow: {
      borderRadius: 4,
      shadowColor: '#000',
      shadowOpacity: 0.3,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 8 },
      elevation: 8,
    },
    ratioRow: {
      flexDirection: 'row',
      gap: 8,
      justifyContent: 'center',
    },
    ratioChip: {
      flex: 1,
      maxWidth: 110,
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: 14,
      borderWidth: 1,
      alignItems: 'center',
      gap: 1,
    },
    templateRow: {
      gap: 8,
      paddingRight: 4,
    },
    templateChip: {
      paddingHorizontal: 14,
      paddingVertical: 9,
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
      paddingHorizontal: 16,
      paddingTop: 12,
      gap: 12,
      backgroundColor: theme.background.primary,
    },
    socialRow: {
      flexDirection: 'row',
      gap: 8,
    },
    saveBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingVertical: 14,
      borderRadius: 999,
    },
    toastWrap: {
      position: 'absolute',
      left: 0,
      right: 0,
      alignItems: 'center',
    },
    toast: {
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderRadius: 999,
      borderWidth: 1,
    },
  });
}
