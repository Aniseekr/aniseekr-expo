// Collapsible "Nearby" panel for the fullscreen pilgrimage map.
//
// Sits bottom-left over the map (clear of the bottom-right recenter FAB).
// Collapsed it is a single pill — "N nearby spots"; tapping expands a
// distance-sorted, scrollable list of the individual scene locations around
// the user. Picking a row asks the map to fly to that spot.
//
// Rule 8: renders nothing when there is no real data — no placeholder rows.

import { useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { useTheme, type ThemePalette } from '../../context/ThemeContext';
import { ThemedText } from '../themed';
import type { NearbySpot } from '../../libs/services/pilgrimage/nearby-spots';

interface NearbySpotsSheetProps {
  spots: readonly NearbySpot[];
  /** True while the nearby search is in flight (drives the loading pill). */
  loading: boolean;
  /** Bottom safe-area inset so the pill clears the home indicator / gesture bar. */
  bottomInset: number;
  onPickSpot: (spot: NearbySpot) => void;
}

const MAX_LIST_HEIGHT = 320;
const THUMB_SIZE = 56;

function formatKm(km: number): string {
  if (!Number.isFinite(km)) return '';
  if (km < 1) return `${Math.round(km * 1000)} m`;
  if (km < 10) return `${km.toFixed(1)} km`;
  return `${Math.round(km)} km`;
}

export default function NearbySpotsSheet({
  spots,
  loading,
  bottomInset,
  onPickSpot,
}: NearbySpotsSheetProps) {
  const { theme } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const [expanded, setExpanded] = useState(false);

  const count = spots.length;
  // Nothing to surface yet — render no panel rather than an empty placeholder.
  if (!loading && count === 0) return null;

  const showList = expanded && count > 0;

  const toggle = () => {
    if (count === 0) return;
    Haptics.selectionAsync().catch(() => undefined);
    setExpanded((v) => !v);
  };

  const handlePick = (spot: NearbySpot) => {
    Haptics.selectionAsync().catch(() => undefined);
    setExpanded(false);
    onPickSpot(spot);
  };

  return (
    <View pointerEvents="box-none" style={[styles.wrap, { paddingBottom: bottomInset + 16 }]}>
      {showList ? (
        <View style={styles.card}>
          <FlatList
            data={spots}
            keyExtractor={(s) => s.markerId}
            style={{ maxHeight: MAX_LIST_HEIGHT }}
            showsVerticalScrollIndicator={false}
            renderItem={({ item }) => (
              <NearbySpotRow spot={item} theme={theme} onPress={() => handlePick(item)} />
            )}
            ItemSeparatorComponent={() => <View style={styles.sep} />}
          />
        </View>
      ) : null}

      <Pressable
        onPress={toggle}
        accessibilityRole="button"
        accessibilityLabel={showList ? 'Hide nearby spots' : 'Show nearby spots'}
        accessibilityState={{ expanded: showList }}
        style={({ pressed }) => [styles.pill, pressed && { opacity: 0.85 }]}>
        {loading && count === 0 ? (
          <>
            <ActivityIndicator size="small" color={theme.accent} />
            <ThemedText variant="captionSmall" weight="700">
              Finding nearby…
            </ThemedText>
          </>
        ) : (
          <>
            <Ionicons name="location" size={14} color={theme.accent} />
            <ThemedText variant="captionSmall" weight="700">
              {`${count} nearby ${count === 1 ? 'spot' : 'spots'}`}
            </ThemedText>
            <Ionicons
              name={showList ? 'chevron-down' : 'chevron-up'}
              size={14}
              color={theme.text.tertiary}
            />
          </>
        )}
      </Pressable>
    </View>
  );
}

interface NearbySpotRowProps {
  spot: NearbySpot;
  theme: ThemePalette;
  onPress: () => void;
}

function NearbySpotRow({ spot, theme, onPress }: NearbySpotRowProps) {
  const styles = useMemo(() => makeRowStyles(theme), [theme]);
  const subtitle = spot.ep > 0 ? `${spot.animeTitle} · EP ${spot.ep}` : spot.animeTitle;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={spot.name}
      style={({ pressed }) => [styles.row, pressed && { opacity: 0.8 }]}>
      <Image
        source={{ uri: spot.image }}
        style={styles.thumb}
        contentFit="cover"
        transition={120}
      />
      <View style={styles.body}>
        <ThemedText variant="bodySmall" weight="700" numberOfLines={1}>
          {spot.name}
        </ThemedText>
        {subtitle ? (
          <ThemedText variant="captionSmall" tone="tertiary" numberOfLines={1}>
            {subtitle}
          </ThemedText>
        ) : null}
      </View>
      <View style={styles.distanceCol}>
        <Ionicons name="navigate" size={11} color={theme.accent} />
        <ThemedText variant="captionSmall" weight="700" style={{ color: theme.accent }}>
          {formatKm(spot.distanceKm)}
        </ThemedText>
      </View>
    </Pressable>
  );
}

function makeStyles(theme: ThemePalette) {
  return StyleSheet.create({
    wrap: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      paddingHorizontal: 12,
      alignItems: 'flex-start',
      gap: 8,
    },
    card: {
      width: '100%',
      borderRadius: 16,
      backgroundColor: theme.background.secondary,
      borderWidth: 1,
      borderColor: theme.glassBorder,
      overflow: 'hidden',
    },
    sep: {
      height: 1,
      backgroundColor: theme.glassBorder,
      marginLeft: 12 + THUMB_SIZE + 10,
    },
    pill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      minHeight: 44,
      paddingHorizontal: 14,
      borderRadius: 22,
      backgroundColor: `${theme.background.primary}F0`,
      borderWidth: 1,
      borderColor: theme.glassBorder,
    },
  });
}

function makeRowStyles(theme: ThemePalette) {
  return StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingHorizontal: 12,
      paddingVertical: 8,
      minHeight: 56,
    },
    thumb: {
      width: THUMB_SIZE,
      height: THUMB_SIZE,
      borderRadius: 8,
      backgroundColor: theme.background.tertiary,
    },
    body: {
      flex: 1,
      gap: 2,
      minWidth: 0,
    },
    distanceCol: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
    },
  });
}
