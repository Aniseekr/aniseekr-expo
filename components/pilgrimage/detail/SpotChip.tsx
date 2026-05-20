// SpotChip — chip-strip item shown above the map view. Memo'd because the
// chip strip re-renders on every selection / visited change, and the strip
// is potentially N chips wide.

import React, { memo, useCallback, useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Radius } from '../../../constants/DesignSystem';
import { ThemedText } from '../../themed';
import type { ThemePalette } from '../../../context/ThemeContext';
import type { AnitabiPoint } from '../../../libs/services/pilgrimage/types';
import { getPilgrimageSpotTitles } from '../../../libs/services/pilgrimage/pilgrimage-localization';
import { formatDistanceKm, getPointSourceLabel } from './_helpers';
import { spotChipPropsEqual } from './_equality';

export interface SpotChipProps {
  spot: AnitabiPoint;
  active: boolean;
  themeColor: string;
  themeColorFg: string;
  distanceKm: number | null;
  visited: boolean;
  saved: boolean;
  planned: boolean;
  hasCapture: boolean;
  theme: ThemePalette;
  onPress: (spot: AnitabiPoint) => void;
}

function SpotChipImpl({
  spot,
  active,
  themeColor,
  themeColorFg,
  distanceKm,
  visited,
  saved,
  planned,
  hasCapture,
  theme,
  onPress,
}: SpotChipProps) {
  const styles = useMemo(() => makeSpotChipStyles(theme), [theme]);
  const label = getPilgrimageSpotTitles(spot).primary;
  const sourceLabel = getPointSourceLabel(spot);
  const epLabel = `${sourceLabel ? `${sourceLabel} ` : ''}EP ${spot.ep}`;
  const handlePress = useCallback(() => onPress(spot), [onPress, spot]);
  return (
    <Pressable
      onPress={handlePress}
      style={({ pressed }) => [
        styles.chip,
        active
          ? { borderColor: themeColor, backgroundColor: `${themeColor}1F` }
          : { borderColor: theme.glassBorder, backgroundColor: theme.background.secondary },
        pressed && { opacity: 0.85 },
      ]}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={`Focus map on ${label}`}>
      <View
        style={[
          styles.epBadge,
          active ? { backgroundColor: themeColor } : { backgroundColor: theme.background.tertiary },
        ]}>
        <ThemedText
          variant="captionSmall"
          weight="800"
          style={{ color: active ? themeColorFg : theme.text.secondary }}>
          {epLabel}
        </ThemedText>
      </View>
      <ThemedText
        variant="bodySmall"
        weight="600"
        numberOfLines={1}
        style={[styles.chipLabel, active ? { color: theme.text.primary } : null]}>
        {label}
      </ThemedText>
      {distanceKm != null ? (
        <View
          style={[
            styles.distanceBadge,
            active
              ? { backgroundColor: `${themeColor}22` }
              : { backgroundColor: theme.background.tertiary },
          ]}>
          <ThemedText
            variant="captionSmall"
            weight="700"
            style={{ color: active ? themeColor : theme.text.secondary }}>
            {formatDistanceKm(distanceKm)}
          </ThemedText>
        </View>
      ) : null}
      {planned ? <Ionicons name="flag" size={13} color={theme.status.warning} /> : null}
      {saved ? <Ionicons name="bookmark" size={12} color={theme.status.info} /> : null}
      {visited ? <Ionicons name="checkmark-circle" size={14} color={theme.status.success} /> : null}
      {hasCapture ? (
        <Ionicons name="camera" size={12} color={active ? themeColor : theme.text.tertiary} />
      ) : null}
    </Pressable>
  );
}

export const SpotChip = memo(SpotChipImpl, spotChipPropsEqual);

function makeSpotChipStyles(theme: ThemePalette) {
  return StyleSheet.create({
    chip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingLeft: 6,
      paddingRight: 12,
      paddingVertical: 6,
      borderRadius: Radius.full,
      borderWidth: 1,
      maxWidth: 280,
      minHeight: 36,
    },
    epBadge: {
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: Radius.full,
      minWidth: 40,
      alignItems: 'center',
      justifyContent: 'center',
    },
    chipLabel: {
      flexShrink: 1,
      color: theme.text.secondary,
    },
    distanceBadge: {
      paddingHorizontal: 7,
      paddingVertical: 3,
      borderRadius: Radius.full,
      alignItems: 'center',
      justifyContent: 'center',
    },
  });
}
