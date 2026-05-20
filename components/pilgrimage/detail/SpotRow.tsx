// SpotRow — row-layout card for one pilgrimage spot. Memo'd so a single
// visited toggle does not re-render every row in the list.
//
// Extracted from `app/(tabs)/pilgrimage/[animeId].tsx` (Phase 1B).

import React, { memo, useCallback, useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { ON_DARK, ThemedText } from '../../themed';
import type { ThemePalette } from '../../../context/ThemeContext';
import type { AnitabiPoint } from '../../../libs/services/pilgrimage/types';
import { getPilgrimageSpotTitles } from '../../../libs/services/pilgrimage/pilgrimage-localization';
import { formatDistanceKm, getPointSourceLabel, hasValidGeo } from './_helpers';
import { spotRowPropsEqual } from './_equality';

export interface SpotRowProps {
  spot: AnitabiPoint;
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
  onOpenMaps: (spot: AnitabiPoint) => void;
}

function SpotRowImpl({
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
  onOpenMaps,
}: SpotRowProps) {
  const styles = useMemo(() => makeRowStyles(theme), [theme]);
  const hasGeo = hasValidGeo(spot.geo);
  const titles = getPilgrimageSpotTitles(spot);
  const sourceLabel = getPointSourceLabel(spot);
  const sceneMeta =
    sceneCount > 1 ? `${sceneCount} scenes` : spot.ep > 0 ? `EP ${spot.ep}` : 'Scene';
  const metaLabel = sourceLabel ? `${sourceLabel} · ${sceneMeta}` : sceneMeta;
  const handlePress = useCallback(() => onPress(spot), [onPress, spot]);
  const handleToggleVisited = useCallback(() => onToggleVisited(spot), [onToggleVisited, spot]);
  const handleOpenMaps = useCallback(() => onOpenMaps(spot), [onOpenMaps, spot]);
  // Only show the REAL/ANIME split when the user actually has a capture — the
  // prior implementation always rendered two <Image> with the same anime URI,
  // which both lied (claiming the left tile was a real photo) and forced
  // expo-image to decode the same bitmap twice per row.
  const showSplit = !!captureUri;
  return (
    <Pressable
      onPress={handlePress}
      style={({ pressed }) => [
        styles.card,
        visited && {
          borderColor: `${theme.status.success}66`,
          backgroundColor: `${theme.status.success}0D`,
        },
        pressed && { opacity: 0.94 },
      ]}
      accessibilityRole="button"
      accessibilityLabel={`Open ${titles.primary}`}>
      <View style={styles.imageRow}>
        {showSplit ? (
          <>
            <View style={styles.imageHalf}>
              <Image
                source={{ uri: captureUri }}
                style={styles.imgFull}
                contentFit="cover"
                transition={150}
              />
              <View style={styles.labelChip}>
                <ThemedText variant="captionSmall" weight="800" style={styles.labelText}>
                  REAL
                </ThemedText>
              </View>
            </View>
            <View style={styles.imageHalf}>
              <Image
                source={{ uri: spot.image }}
                style={styles.imgFull}
                contentFit="cover"
                transition={150}
              />
              <View style={[styles.labelChip, { backgroundColor: `${themeColor}E6` }]}>
                <ThemedText
                  variant="captionSmall"
                  weight="800"
                  style={[styles.labelText, { color: themeColorFg }]}>
                  ANIME
                </ThemedText>
              </View>
            </View>
          </>
        ) : (
          <View style={styles.imageFull}>
            <Image
              source={{ uri: spot.image }}
              style={styles.imgFull}
              contentFit="cover"
              transition={150}
            />
            <View style={[styles.labelChip, { backgroundColor: `${themeColor}E6` }]}>
              <ThemedText
                variant="captionSmall"
                weight="800"
                style={[styles.labelText, { color: themeColorFg }]}>
                ANIME
              </ThemedText>
            </View>
            {hasCapture ? (
              <View style={[styles.captureDot, { borderColor: theme.background.primary }]}>
                <Ionicons name="camera" size={9} color="#000" />
              </View>
            ) : null}
          </View>
        )}
      </View>
      <View style={styles.infoRow}>
        <View style={styles.infoCol}>
          <ThemedText variant="bodyMedium" weight="700" numberOfLines={1}>
            {titles.primary}
          </ThemedText>
          <View style={styles.epRow}>
            <Ionicons
              name={sceneCount > 1 ? 'images-outline' : 'film-outline'}
              size={11}
              color={theme.text.tertiary}
            />
            <ThemedText variant="captionSmall" tone="tertiary" numberOfLines={1}>
              {metaLabel}
              {titles.secondary ? ` · ${titles.secondary}` : ''}
            </ThemedText>
            {distanceKm != null ? (
              <>
                <View style={[styles.dot, { backgroundColor: theme.text.tertiary }]} />
                <ThemedText variant="captionSmall" weight="600" style={{ color: themeColor }}>
                  {formatDistanceKm(distanceKm)}
                </ThemedText>
              </>
            ) : null}
          </View>
        </View>
        <View style={styles.actionsCol}>
          <Pressable
            onPress={handleToggleVisited}
            style={({ pressed }) => [
              styles.visitPill,
              {
                backgroundColor: visited ? theme.background.tertiary : theme.background.secondary,
                borderColor: visited ? `${theme.status.success}66` : theme.glassBorder,
              },
              pressed && { opacity: 0.75 },
            ]}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: visited }}
            accessibilityLabel={visited ? 'Mark as not visited' : 'Mark as visited'}
            hitSlop={4}>
            <Ionicons
              name={visited ? 'checkmark' : 'ellipse-outline'}
              size={12}
              color={visited ? theme.status.success : theme.text.secondary}
            />
            <ThemedText
              variant="captionSmall"
              weight="700"
              style={{
                color: visited ? theme.status.success : theme.text.secondary,
              }}>
              {visited ? 'Visited' : 'Visit'}
            </ThemedText>
          </Pressable>
          {planned ? <Ionicons name="flag" size={15} color={theme.status.warning} /> : null}
          {saved ? <Ionicons name="bookmark" size={14} color={theme.status.info} /> : null}
          <Pressable
            onPress={handleOpenMaps}
            disabled={!hasGeo}
            style={({ pressed }) => [
              styles.iconPill,
              { backgroundColor: theme.background.tertiary },
              !hasGeo && { opacity: 0.4 },
              pressed && hasGeo && { opacity: 0.75 },
            ]}
            accessibilityRole="button"
            accessibilityLabel={`Directions to ${titles.primary}`}
            hitSlop={4}>
            <MaterialIcons
              name="directions"
              size={16}
              color={hasGeo ? theme.status.info : theme.text.tertiary}
            />
          </Pressable>
        </View>
      </View>
    </Pressable>
  );
}

export const SpotRow = memo(SpotRowImpl, spotRowPropsEqual);

function makeRowStyles(theme: ThemePalette) {
  return StyleSheet.create({
    card: {
      backgroundColor: theme.background.secondary,
      borderColor: theme.glassBorder,
      borderWidth: 1,
      borderRadius: 16,
      padding: 12,
      gap: 10,
    },
    imageRow: {
      flexDirection: 'row',
      gap: 6,
      height: 120,
    },
    imageHalf: {
      flex: 1,
      borderRadius: 10,
      overflow: 'hidden',
      backgroundColor: theme.background.tertiary,
      position: 'relative',
    },
    imageFull: {
      flex: 1,
      borderRadius: 10,
      overflow: 'hidden',
      backgroundColor: theme.background.tertiary,
      position: 'relative',
    },
    imgFull: {
      width: '100%',
      height: '100%',
    },
    labelChip: {
      position: 'absolute',
      top: 6,
      left: 6,
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 6,
      backgroundColor: 'rgba(10,10,10,0.7)',
    },
    labelText: {
      color: ON_DARK,
      fontSize: 9,
      letterSpacing: 0.5,
    },
    captureDot: {
      position: 'absolute',
      bottom: 6,
      right: 6,
      width: 18,
      height: 18,
      borderRadius: 9,
      backgroundColor: theme.accent,
      borderWidth: 2,
      alignItems: 'center',
      justifyContent: 'center',
    },
    infoRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    infoCol: {
      flex: 1,
      gap: 3,
      minWidth: 0,
    },
    epRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      flexWrap: 'wrap',
    },
    dot: {
      width: 3,
      height: 3,
      borderRadius: 1.5,
      opacity: 0.6,
    },
    actionsCol: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    visitPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 14,
      borderWidth: 1,
    },
    iconPill: {
      width: 30,
      height: 30,
      borderRadius: 15,
      alignItems: 'center',
      justifyContent: 'center',
    },
  });
}
