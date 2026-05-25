// SpotSheet — bottom sheet shown when the user taps a pilgrimage spot. Lifts
// the heavy hero/scene-rail/actions out of the route file so they don't
// re-render with the rest of the screen.
//
// Phase 3 replaces the underlying <Modal> with @gorhom/bottom-sheet for true
// drag-to-dismiss + early-close UX.

import React, { memo, useCallback, useEffect, useMemo, useRef } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetView,
  type BottomSheetBackdropProps,
} from '@gorhom/bottom-sheet';
import { Radius, Spacing } from '../../../constants/DesignSystem';
import { ON_DARK, ThemedText, readableTextOn } from '../../themed';
import type { ThemePalette } from '../../../context/ThemeContext';
import type { AnitabiPoint } from '../../../libs/services/pilgrimage/types';
import { getPilgrimageSpotTitles } from '../../../libs/services/pilgrimage/pilgrimage-localization';
import {
  buildAnitabiMapUrl,
  formatDistanceKm,
  getPointSourceBangumiId,
  getPointSourceLabel,
  hasValidGeo,
} from './_helpers';
import { AnitabiOriginCredit } from '../common/AnitabiOriginCredit';

export interface SpotSheetProps {
  /** When null the sheet is closed. Setting it open animates the sheet up. */
  spot: AnitabiPoint | null;
  scenes: readonly AnitabiPoint[];
  sceneCount: number;
  themeColor: string;
  themeColorFg: string;
  distanceKm: number | null;
  visitedTarget: AnitabiPoint | null;
  visited: boolean;
  saved: boolean;
  planned: boolean;
  hasCapture: boolean;
  /**
   * Bangumi subject id used to build the Anitabi "view on Anitabi" link at
   * the bottom of the sheet (CC BY-NC-SA 4.0 attribution for the spot data).
   * Pass the parent anime's id; the sheet falls back to the spot's own
   * `sourceBangumiId` (series cross-link) when this is null.
   */
  anitabiBangumiId?: number | null;
  theme: ThemePalette;
  onClose: () => void;
  onToggleVisited: (spot: AnitabiPoint) => void;
  onToggleSaved: (spot: AnitabiPoint) => void;
  onTogglePlanned: (spot: AnitabiPoint) => void;
  onOpenMaps: (spot: AnitabiPoint) => void;
  onStartCamera: (spot: AnitabiPoint) => void;
  onFrameShot: (spot: AnitabiPoint) => void;
  onSelectScene: (spot: AnitabiPoint) => void;
}

function SpotSheetImpl({
  spot,
  scenes,
  sceneCount,
  themeColor,
  themeColorFg,
  distanceKm,
  visitedTarget,
  visited,
  saved,
  planned,
  hasCapture,
  anitabiBangumiId = null,
  theme,
  onClose,
  onToggleVisited,
  onToggleSaved,
  onTogglePlanned,
  onOpenMaps,
  onStartCamera,
  onFrameShot,
  onSelectScene,
}: SpotSheetProps) {
  const styles = useMemo(() => makeSheetStyles(theme), [theme]);
  const sheetRef = useRef<BottomSheet>(null);
  const snapPoints = useMemo(() => ['62%', '92%'], []);

  // Open / close the sheet imperatively when `spot` flips. The parent owns the
  // active-spot state; we mirror it into snap-point control so the sheet
  // animates instead of just popping. Calling close() while `spot` is still
  // truthy is safe — onChange to -1 fires `onClose` which then clears it.
  useEffect(() => {
    if (spot) {
      sheetRef.current?.snapToIndex(0);
    } else {
      sheetRef.current?.close();
    }
  }, [spot]);

  const handleSheetChange = useCallback(
    (index: number) => {
      if (index === -1) onClose();
    },
    [onClose]
  );

  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop
        {...props}
        appearsOnIndex={0}
        disappearsOnIndex={-1}
        opacity={0.55}
        pressBehavior="close"
      />
    ),
    []
  );

  const handleClosePress = useCallback(() => sheetRef.current?.close(), []);
  const handleToggleVisited = useCallback(() => {
    if (!spot) return;
    onToggleVisited(visitedTarget ?? spot);
  }, [onToggleVisited, spot, visitedTarget]);
  const handleToggleSaved = useCallback(() => {
    if (spot) onToggleSaved(spot);
  }, [onToggleSaved, spot]);
  const handleTogglePlanned = useCallback(() => {
    if (spot) onTogglePlanned(spot);
  }, [onTogglePlanned, spot]);
  const handleOpenMaps = useCallback(() => {
    if (spot) onOpenMaps(spot);
  }, [onOpenMaps, spot]);
  const handleStartCamera = useCallback(() => {
    if (spot) onStartCamera(spot);
  }, [onStartCamera, spot]);
  const handleFrameShot = useCallback(() => {
    if (spot) onFrameShot(spot);
  }, [onFrameShot, spot]);

  // Build the Anitabi map URL for the spot. Prefer the parent-supplied
  // bangumiId (the anime detail), fall back to the spot's own series source
  // id (set when this spot was pulled in from a related anime). Returns null
  // when neither is available, in which case we link to the Anitabi homepage
  // rather than a broken `?bangumiId=` query.
  const anitabiUrl = useMemo(() => {
    if (anitabiBangumiId && Number.isFinite(anitabiBangumiId) && anitabiBangumiId > 0) {
      return buildAnitabiMapUrl(anitabiBangumiId);
    }
    if (spot) {
      const sourceId = getPointSourceBangumiId(spot);
      if (sourceId && sourceId > 0) return buildAnitabiMapUrl(sourceId);
    }
    return 'https://www.anitabi.cn/';
  }, [anitabiBangumiId, spot]);
  const handleOpenAnitabi = useCallback(() => {
    Linking.openURL(anitabiUrl).catch(() => undefined);
  }, [anitabiUrl]);

  // The BottomSheet element is rendered EXACTLY ONCE per parent mount: swapping
  // between a "closed" and "open" instance based on whether `spot` is null was
  // an earlier shape that left @gorhom/bottom-sheet's internal reanimated
  // state dirty after a close-while-animating, so subsequent opens silently
  // failed to snap. We always render the full sheet element and gate the
  // inner content with a null check; visibility is controlled imperatively
  // via the ref + snap index in the effect above.
  const hasGeo = spot ? hasValidGeo(spot.geo) : false;
  const titles = spot ? getPilgrimageSpotTitles(spot) : { primary: '', secondary: '' };
  const sceneStack = spot && scenes.length > 0 ? scenes : spot ? [spot] : [];
  const activeSceneIndex =
    spot && sceneStack.length > 0
      ? Math.max(0, sceneStack.findIndex((scene) => scene.id === spot.id))
      : 0;
  const visitSpot = visitedTarget ?? spot;

  return (
    <BottomSheet
      ref={sheetRef}
      index={-1}
      snapPoints={snapPoints}
      enablePanDownToClose
      backgroundStyle={styles.bg}
      handleIndicatorStyle={styles.handleIndicator}
      onChange={handleSheetChange}
      backdropComponent={spot ? renderBackdrop : undefined}>
      <BottomSheetView style={styles.sheetContent}>
        {!spot ? (
          <View />
        ) : (
          <>
        <View style={styles.hero}>
          <Image source={{ uri: spot.image }} style={styles.cover} contentFit="cover" />
          <LinearGradient
            colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.76)']}
            style={styles.sheetHeroGradient}
          />
          <View style={styles.heroText}>
            <ThemedText
              variant="titleLarge"
              weight="800"
              numberOfLines={1}
              style={{ color: ON_DARK }}>
              {titles.primary}
            </ThemedText>
            {titles.secondary ? (
              <ThemedText
                variant="bodySmall"
                numberOfLines={1}
                style={{ color: 'rgba(255,255,255,0.72)' }}>
                {titles.secondary}
              </ThemedText>
            ) : null}
          </View>
          <Pressable onPress={handleClosePress} hitSlop={12} style={styles.closeBtn}>
            <Ionicons name="close" size={18} color={ON_DARK} />
          </Pressable>
        </View>

        {sceneStack.length > 1 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.sceneRail}>
            {sceneStack.map((scene, index) => {
              const active = scene.id === spot.id;
              const sourceLabel = getPointSourceLabel(scene);
              const epLabel = scene.ep > 0 ? `EP ${scene.ep}` : `#${index + 1}`;
              return (
                <Pressable
                  key={scene.id}
                  onPress={() => onSelectScene(scene)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={`Show scene ${index + 1}`}
                  style={({ pressed }) => [
                    styles.sceneThumbBtn,
                    active ? { borderColor: themeColor } : { borderColor: theme.glassBorder },
                    pressed && { opacity: 0.78 },
                  ]}>
                  <Image
                    source={{ uri: scene.image }}
                    style={styles.sceneThumb}
                    contentFit="cover"
                  />
                  <View style={styles.sceneThumbScrim} />
                  <View
                    style={[
                      styles.sceneIndexPill,
                      { backgroundColor: active ? themeColor : 'rgba(0,0,0,0.62)' },
                    ]}>
                    <ThemedText
                      variant="captionSmall"
                      weight="800"
                      numberOfLines={1}
                      style={{ color: active ? themeColorFg : ON_DARK }}>
                      {sourceLabel ? `${sourceLabel} ${epLabel}` : epLabel}
                    </ThemedText>
                  </View>
                  {visited && visitSpot && visitSpot.id === scene.id ? (
                    <View style={styles.sceneVisitedDot}>
                      <Ionicons
                        name="checkmark"
                        size={10}
                        color={readableTextOn(theme.status.success)}
                      />
                    </View>
                  ) : null}
                </Pressable>
              );
            })}
          </ScrollView>
        ) : null}

        <View style={styles.distanceRow}>
          <Ionicons name="location-outline" size={15} color={theme.text.tertiary} />
          <ThemedText variant="bodySmall" tone="secondary">
            {distanceKm != null
              ? `${formatDistanceKm(distanceKm)} away`
              : sceneStack.length > 1
                ? `${activeSceneIndex + 1} of ${sceneStack.length} scenes`
                : 'Scene location'}
          </ThemedText>
        </View>

        <AnitabiOriginCredit
          source={spot}
          variant="compact"
          tone="tertiary"
          textVariant="captionSmall"
          style={styles.originRow}
        />

        <View style={styles.intentActions}>
          <Pressable
            onPress={handleToggleVisited}
            style={({ pressed }) => [
              styles.intentBtn,
              visited
                ? {
                    backgroundColor: `${theme.status.success}22`,
                    borderColor: theme.status.success,
                  }
                : {
                    backgroundColor: theme.background.tertiary,
                    borderColor: theme.glassBorder,
                  },
              pressed && { opacity: 0.84 },
            ]}>
            <Ionicons
              name={visited ? 'checkmark-circle' : 'film-outline'}
              size={16}
              color={visited ? theme.status.success : theme.text.secondary}
            />
            <ThemedText
              variant="bodySmall"
              weight="700"
              style={{ color: visited ? theme.status.success : theme.text.secondary }}>
              {visited ? 'Visited' : sceneCount > 1 ? `${sceneCount} scenes` : 'Scene'}
            </ThemedText>
          </Pressable>
          <Pressable
            onPress={handleToggleSaved}
            style={({ pressed }) => [
              styles.intentBtn,
              saved
                ? { backgroundColor: `${theme.status.info}22`, borderColor: theme.status.info }
                : {
                    backgroundColor: theme.background.tertiary,
                    borderColor: theme.glassBorder,
                  },
              pressed && { opacity: 0.84 },
            ]}>
            <Ionicons
              name={saved ? 'bookmark' : 'bookmark-outline'}
              size={16}
              color={saved ? theme.status.info : theme.text.secondary}
            />
            <ThemedText
              variant="bodySmall"
              weight="700"
              style={{ color: saved ? theme.status.info : theme.text.secondary }}>
              Save
            </ThemedText>
          </Pressable>
          <Pressable
            onPress={handleTogglePlanned}
            style={({ pressed }) => [
              styles.intentBtn,
              planned
                ? {
                    backgroundColor: `${theme.status.warning}22`,
                    borderColor: theme.status.warning,
                  }
                : {
                    backgroundColor: theme.background.tertiary,
                    borderColor: theme.glassBorder,
                  },
              pressed && { opacity: 0.84 },
            ]}>
            <Ionicons
              name={planned ? 'flag' : 'flag-outline'}
              size={16}
              color={planned ? theme.status.warning : theme.text.secondary}
            />
            <ThemedText
              variant="bodySmall"
              weight="700"
              style={{ color: planned ? theme.status.warning : theme.text.secondary }}>
              Plan
            </ThemedText>
          </Pressable>
        </View>

        <Pressable
          onPress={handleStartCamera}
          style={({ pressed }) => [
            styles.startCameraBtn,
            { backgroundColor: themeColor },
            pressed && { opacity: 0.86 },
          ]}>
          <Ionicons name="camera" size={18} color={themeColorFg} />
          <ThemedText variant="bodyMedium" weight="800" style={{ color: themeColorFg }}>
            Start AR Camera
          </ThemedText>
        </Pressable>

        <Pressable
          onPress={handleFrameShot}
          style={({ pressed }) => [
            styles.frameShotBtn,
            { borderColor: hasCapture ? themeColor : theme.glassBorder },
            pressed && { opacity: 0.82 },
          ]}>
          <Ionicons name="image-outline" size={18} color={theme.text.primary} />
          <ThemedText variant="bodyMedium" weight="700">
            Photo Tips & Best Frame
          </ThemedText>
        </Pressable>

        <View style={styles.linkRow}>
          <Pressable
            onPress={handleOpenMaps}
            disabled={!hasGeo}
            style={({ pressed }) => [
              styles.linkBtn,
              !hasGeo && { opacity: 0.45 },
              pressed && hasGeo && { opacity: 0.72 },
            ]}>
            <Ionicons name="location-outline" size={15} color={theme.text.tertiary} />
            <ThemedText variant="bodySmall" weight="700" tone="secondary">
              Open in Maps
            </ThemedText>
          </Pressable>
          <View style={[styles.linkDivider, { backgroundColor: theme.glassBorder }]} />
          <Pressable
            onPress={handleOpenAnitabi}
            accessibilityRole="link"
            accessibilityLabel="Attribute and view on Anitabi"
            style={({ pressed }) => [styles.linkBtn, pressed && { opacity: 0.72 }]}>
            <Ionicons name="open-outline" size={15} color={theme.text.tertiary} />
            <ThemedText variant="bodySmall" weight="700" tone="secondary">
              Attribute to Anitabi
            </ThemedText>
          </Pressable>
        </View>
          </>
        )}
      </BottomSheetView>
    </BottomSheet>
  );
}

function areEqual(prev: SpotSheetProps, next: SpotSheetProps): boolean {
  return (
    prev.spot === next.spot &&
    prev.scenes === next.scenes &&
    prev.sceneCount === next.sceneCount &&
    prev.themeColor === next.themeColor &&
    prev.themeColorFg === next.themeColorFg &&
    prev.distanceKm === next.distanceKm &&
    prev.visitedTarget === next.visitedTarget &&
    prev.visited === next.visited &&
    prev.saved === next.saved &&
    prev.planned === next.planned &&
    prev.hasCapture === next.hasCapture &&
    prev.anitabiBangumiId === next.anitabiBangumiId &&
    prev.theme === next.theme &&
    prev.onClose === next.onClose &&
    prev.onToggleVisited === next.onToggleVisited &&
    prev.onToggleSaved === next.onToggleSaved &&
    prev.onTogglePlanned === next.onTogglePlanned &&
    prev.onOpenMaps === next.onOpenMaps &&
    prev.onStartCamera === next.onStartCamera &&
    prev.onFrameShot === next.onFrameShot &&
    prev.onSelectScene === next.onSelectScene
  );
}

export const SpotSheet = memo(SpotSheetImpl, areEqual);

function makeSheetStyles(theme: ThemePalette) {
  return StyleSheet.create({
    bg: {
      backgroundColor: theme.background.secondary,
    },
    handleIndicator: {
      backgroundColor: theme.glassBorder,
    },
    sheetContent: {
      paddingHorizontal: Spacing.screenPadding,
      paddingTop: 4,
      paddingBottom: Spacing.lg,
    },
    hero: {
      height: 140,
      borderRadius: Radius.lg,
      overflow: 'hidden',
      marginBottom: Spacing.md,
      backgroundColor: theme.background.tertiary,
    },
    cover: {
      width: '100%',
      height: '100%',
      backgroundColor: theme.background.tertiary,
    },
    sheetHeroGradient: {
      ...StyleSheet.absoluteFillObject,
    },
    heroText: {
      position: 'absolute',
      left: 16,
      right: 16,
      bottom: 14,
      gap: 2,
    },
    closeBtn: {
      position: 'absolute',
      top: 10,
      right: 10,
      width: 32,
      height: 32,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 16,
      backgroundColor: 'rgba(0,0,0,0.46)',
    },
    sceneRail: {
      gap: 8,
      paddingRight: 2,
      marginTop: -4,
      marginBottom: Spacing.md,
    },
    sceneThumbBtn: {
      width: 78,
      height: 56,
      borderRadius: 14,
      overflow: 'hidden',
      borderWidth: 2,
      backgroundColor: theme.background.tertiary,
    },
    sceneThumb: {
      width: '100%',
      height: '100%',
    },
    sceneThumbScrim: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(0,0,0,0.14)',
    },
    sceneIndexPill: {
      position: 'absolute',
      left: 5,
      bottom: 5,
      maxWidth: 64,
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: Radius.full,
    },
    sceneVisitedDot: {
      position: 'absolute',
      top: 5,
      right: 5,
      width: 18,
      height: 18,
      borderRadius: 9,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.status.success,
    },
    distanceRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginBottom: 4,
    },
    originRow: {
      marginBottom: Spacing.md,
    },
    intentActions: {
      flexDirection: 'row',
      gap: Spacing.sm,
      marginBottom: Spacing.md,
    },
    intentBtn: {
      flex: 1,
      height: 40,
      borderRadius: Radius.md,
      borderWidth: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
    },
    startCameraBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      height: 56,
      borderRadius: Radius.md,
      marginBottom: 10,
    },
    frameShotBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      height: 54,
      borderRadius: Radius.md,
      backgroundColor: theme.background.secondary,
      borderWidth: 1,
    },
    linkRow: {
      flexDirection: 'row',
      alignItems: 'stretch',
      marginTop: 8,
      height: 44,
    },
    linkBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
    },
    linkDivider: {
      width: StyleSheet.hairlineWidth,
      marginVertical: 8,
    },
  });
}
