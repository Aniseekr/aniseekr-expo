// SceneTile — grid tile for one pilgrimage spot. Memo'd with a custom
// equality fn so flipping visited / saved / planned on one tile does not
// re-render the entire grid (50–200 tiles).
//
// Extracted from `app/(tabs)/pilgrimage/[animeId].tsx` as part of the
// pilgrimage detail perf refactor (Phase 1B).

import React, { memo, useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { ON_DARK, ThemedText, readableTextOn } from '../../themed';
import type { ThemePalette } from '../../../context/ThemeContext';
import type { AnitabiPoint } from '../../../libs/services/pilgrimage/types';
import { getPilgrimageSpotTitles } from '../../../libs/services/pilgrimage/pilgrimage-localization';
import { formatDistanceKm, getPointSourceLabel } from './_helpers';
import { sceneTilePropsEqual } from './_equality';

export interface SceneTileProps {
  /** Representative scene of the location (its first cut). */
  spot: AnitabiPoint;
  /** Number of scene-cuts filmed at this location (>= 1). */
  sceneCount: number;
  themeColor: string;
  themeColorFg: string;
  distanceKm: number | null;
  visited: boolean;
  saved: boolean;
  planned: boolean;
  hasCapture: boolean;
  captureUri: string | null;
  theme: ThemePalette;
  onPress: (spot: AnitabiPoint) => void;
  onToggleVisited: (spot: AnitabiPoint) => void;
  onTakeComparison: (spot: AnitabiPoint) => void;
}

function SceneTileImpl({
  spot,
  sceneCount,
  themeColor,
  themeColorFg,
  distanceKm,
  visited,
  saved,
  planned,
  hasCapture,
  captureUri,
  theme,
  onPress,
  onToggleVisited,
  onTakeComparison,
}: SceneTileProps) {
  const styles = useMemo(() => makeTileStyles(theme), [theme]);
  const titles = getPilgrimageSpotTitles(spot);
  const sourceLabel = getPointSourceLabel(spot);
  const primaryMeta =
    sceneCount > 1 ? `${sceneCount} scenes` : spot.ep > 0 ? `EP ${spot.ep}` : 'Scene';
  const labelledMeta = sourceLabel ? `${sourceLabel} · ${primaryMeta}` : primaryMeta;
  const metaLine =
    distanceKm != null ? `${labelledMeta} · ${formatDistanceKm(distanceKm)}` : labelledMeta;
  const [showCapture, setShowCapture] = useState(false);
  const flipped = showCapture && !!captureUri;
  const displayedUri = flipped ? captureUri! : spot.image;
  const handleFlip = useCallback(() => {
    Haptics.selectionAsync().catch(() => undefined);
    if (captureUri) {
      setShowCapture((s) => !s);
    } else {
      onTakeComparison(spot);
    }
  }, [captureUri, onTakeComparison, spot]);
  const handlePress = useCallback(() => onPress(spot), [onPress, spot]);
  const handleLongPress = useCallback(() => {
    Haptics.selectionAsync().catch(() => undefined);
    onToggleVisited(spot);
  }, [onToggleVisited, spot]);
  return (
    <Pressable
      onPress={handlePress}
      onLongPress={handleLongPress}
      delayLongPress={280}
      style={({ pressed }) => [
        styles.tile,
        visited && { borderColor: `${theme.status.success}80` },
        pressed && { opacity: 0.92 },
      ]}
      accessibilityRole="button"
      accessibilityLabel={`Open ${titles.primary}`}
      accessibilityHint="Long press to toggle visited">
      <Image
        source={{ uri: displayedUri }}
        style={styles.image}
        contentFit="cover"
        transition={160}
      />
      <View style={styles.baseMask} pointerEvents="none" />
      <LinearGradient
        colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.62)']}
        locations={[0, 1]}
        style={styles.captionGradient}
        pointerEvents="none"
      />
      {hasCapture ? (
        <View
          style={[styles.cornerBadge, styles.cornerLeft, { backgroundColor: `${themeColor}E6` }]}>
          <Ionicons name="camera" size={10} color={themeColorFg} />
        </View>
      ) : null}
      {visited ? (
        <View
          style={[
            styles.cornerBadge,
            styles.cornerRight,
            { backgroundColor: theme.status.success },
          ]}>
          <Ionicons name="checkmark" size={11} color={readableTextOn(theme.status.success)} />
        </View>
      ) : null}
      {planned || saved ? (
        <View style={[styles.intentBadge, { backgroundColor: theme.background.secondary }]}>
          <Ionicons
            name={planned ? 'flag' : 'bookmark'}
            size={11}
            color={planned ? theme.status.warning : theme.status.info}
          />
        </View>
      ) : null}
      <View style={styles.captionWrap} pointerEvents="none">
        <ThemedText variant="bodySmall" weight="700" numberOfLines={1} style={styles.captionTitle}>
          {titles.primary}
        </ThemedText>
        <ThemedText
          variant="captionSmall"
          weight="600"
          numberOfLines={1}
          style={styles.captionMeta}>
          {metaLine}
        </ThemedText>
      </View>
      <Pressable
        onPress={handleFlip}
        hitSlop={6}
        style={({ pressed }) => [
          styles.flipBtn,
          flipped && { backgroundColor: `${themeColor}E6` },
          pressed && { opacity: 0.75 },
        ]}
        accessibilityRole="button"
        accessibilityLabel={
          captureUri ? (flipped ? 'Show scene image' : 'Show your photo') : 'Take comparison photo'
        }>
        <Ionicons
          name={captureUri ? 'swap-horizontal' : 'camera-outline'}
          size={14}
          color={flipped ? themeColorFg : ON_DARK}
        />
      </Pressable>
    </Pressable>
  );
}

// Tiles are pure renders of `spot.id + display flags + handlers`. The equality
// fn lives in ./_equality so unit tests can pin it without dragging RN in.
export const SceneTile = memo(SceneTileImpl, sceneTilePropsEqual);

function makeTileStyles(theme: ThemePalette) {
  return StyleSheet.create({
    tile: {
      aspectRatio: 1,
      borderRadius: 16,
      overflow: 'hidden',
      backgroundColor: theme.background.tertiary,
      borderWidth: 1,
      borderColor: theme.glassBorder,
      position: 'relative',
    },
    image: {
      ...StyleSheet.absoluteFillObject,
    },
    baseMask: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(0,0,0,0.12)',
    },
    captionGradient: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      height: '55%',
    },
    cornerBadge: {
      position: 'absolute',
      top: 8,
      width: 22,
      height: 22,
      borderRadius: 11,
      alignItems: 'center',
      justifyContent: 'center',
    },
    cornerLeft: { left: 8 },
    cornerRight: { right: 8 },
    intentBadge: {
      position: 'absolute',
      top: 36,
      right: 8,
      width: 22,
      height: 22,
      borderRadius: 11,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: theme.glassBorder,
    },
    captionWrap: {
      position: 'absolute',
      left: 10,
      right: 10,
      bottom: 9,
      gap: 1,
    },
    captionTitle: {
      color: ON_DARK,
      textShadowColor: 'rgba(0,0,0,0.55)',
      textShadowRadius: 4,
    },
    captionMeta: {
      color: 'rgba(255,255,255,0.85)',
      textShadowColor: 'rgba(0,0,0,0.45)',
      textShadowRadius: 3,
    },
    flipBtn: {
      position: 'absolute',
      bottom: 8,
      right: 8,
      width: 26,
      height: 26,
      borderRadius: 13,
      backgroundColor: 'rgba(0,0,0,0.55)',
      alignItems: 'center',
      justifyContent: 'center',
    },
  });
}
