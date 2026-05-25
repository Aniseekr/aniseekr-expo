// Quick-switch sheet shown when the user taps the reference thumbnail in the
// camera. Lists every pilgrimage spot for the current anime; tapping one
// navigates directly to that spot's camera screen (no tips/intro stop-over).
//
// Rule 8: this component is a pure renderer. The parent owns the spot list
// and either passes the real points (after they've been fetched from
// pilgrimageRepository) or `null` / an empty array. We render a clear
// "Loading…" or "Unavailable" state instead of fake data.

import { useMemo } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTheme } from '../../../context/ThemeContext';
import { hapticsBridge } from '../../../modules/haptics/hapticsBridge';
import { ThemedText, readableTextOn } from '../../themed';
import { getPilgrimageSpotTitles } from '../../../libs/services/pilgrimage/pilgrimage-localization';
import { toFullResImageUrl } from '../../../libs/services/pilgrimage/anitabi-image';
import type { AnitabiPoint } from '../../../libs/services/pilgrimage/types';
import { AnitabiOriginCredit } from '../common/AnitabiOriginCredit';

interface SceneSwitcherSheetProps {
  visible: boolean;
  onClose: () => void;
  /** Real spots for the current anime. `null` ⇒ still loading. */
  spots: readonly AnitabiPoint[] | null;
  currentSpotId: string;
  themeColor: string;
  onPickSpot: (spot: AnitabiPoint) => void;
  loading?: boolean;
}

const TILE_WIDTH = 132;
const TILE_HEIGHT = 96;

export default function SceneSwitcherSheet({
  visible,
  onClose,
  spots,
  currentSpotId,
  themeColor,
  onPickSpot,
  loading = false,
}: SceneSwitcherSheetProps) {
  const { theme } = useTheme();

  // Surface the currently-selected spot first so the user can find their
  // place in long lists, then everything else in source order.
  const orderedSpots = useMemo(() => {
    if (!spots) return null;
    const current = spots.find((s) => s.id === currentSpotId);
    const rest = spots.filter((s) => s.id !== currentSpotId);
    return current ? [current, ...rest] : rest;
  }, [spots, currentSpotId]);

  const handlePick = (spot: AnitabiPoint) => {
    if (spot.id === currentSpotId) {
      // Tapping the active scene just closes the sheet — no point reloading
      // the same camera screen.
      hapticsBridge.tap();
      onClose();
      return;
    }
    hapticsBridge.success();
    onPickSpot(spot);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent>
      <Pressable onPress={onClose} style={styles.backdrop}>
        {/* Inner Pressable swallows taps so they don't bubble up to the
            backdrop dismissal handler. */}
        <Pressable
          onPress={() => undefined}
          style={[
            styles.sheet,
            {
              backgroundColor: theme.background.secondary,
              borderColor: theme.glassBorder,
            },
          ]}>
          <SafeAreaView edges={['bottom']}>
            <View style={styles.header}>
              <View style={styles.handle} />
              <View style={styles.headerRow}>
                <View style={{ flex: 1 }}>
                  <ThemedText variant="titleSmall" weight="700">
                    Switch scene
                  </ThemedText>
                  <ThemedText variant="captionSmall" tone="secondary">
                    {orderedSpots == null
                      ? 'Loading scenes…'
                      : `${orderedSpots.length} scene${orderedSpots.length === 1 ? '' : 's'} in this anime`}
                  </ThemedText>
                </View>
                <Pressable
                  onPress={() => {
                    hapticsBridge.tap();
                    onClose();
                  }}
                  hitSlop={14}
                  accessibilityRole="button"
                  accessibilityLabel="Close scene switcher"
                  style={({ pressed }) => [
                    styles.closeBtn,
                    {
                      backgroundColor: theme.background.tertiary,
                      borderColor: theme.glassBorder,
                      opacity: pressed ? 0.7 : 1,
                    },
                  ]}>
                  <Ionicons name="close" size={18} color={theme.text.primary} />
                </Pressable>
              </View>
            </View>

            {loading || orderedSpots == null ? (
              <View style={styles.loadingWrap}>
                <ActivityIndicator color={themeColor} />
              </View>
            ) : orderedSpots.length === 0 ? (
              <View style={styles.loadingWrap}>
                <ThemedText variant="bodySmall" tone="secondary" align="center">
                  No other scenes available for this anime.
                </ThemedText>
              </View>
            ) : (
              <FlatList
                horizontal
                data={orderedSpots}
                keyExtractor={(s) => s.id}
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.listContent}
                renderItem={({ item }) => (
                  <SceneTile
                    spot={item}
                    isActive={item.id === currentSpotId}
                    themeColor={themeColor}
                    onPress={() => handlePick(item)}
                  />
                )}
              />
            )}
          </SafeAreaView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

interface SceneTileProps {
  spot: AnitabiPoint;
  isActive: boolean;
  themeColor: string;
  onPress: () => void;
}

function SceneTile({ spot, isActive, themeColor, onPress }: SceneTileProps) {
  const { theme } = useTheme();
  const titles = getPilgrimageSpotTitles(spot);
  const fullResImage = toFullResImageUrl(spot.image);
  const activeFg = readableTextOn(themeColor);

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Switch to ${titles.primary}`}
      style={({ pressed }) => [
        styles.tile,
        {
          borderColor: isActive ? themeColor : theme.glassBorder,
          borderWidth: isActive ? 2 : StyleSheet.hairlineWidth,
          opacity: pressed ? 0.75 : 1,
        },
      ]}>
      <Image
        source={{ uri: fullResImage || spot.image }}
        style={styles.tileImage}
        contentFit="cover"
        transition={120}
      />
      {isActive ? (
        <View style={[styles.activeBadge, { backgroundColor: themeColor }]}>
          <Ionicons name="checkmark" size={11} color={activeFg} />
          <ThemedText
            variant="captionSmall"
            weight="700"
            style={{ color: activeFg, letterSpacing: 0.5 }}>
            NOW
          </ThemedText>
        </View>
      ) : null}
      <View style={styles.tileCaption}>
        <ThemedText
          variant="captionSmall"
          weight="700"
          numberOfLines={1}
          style={{ color: '#fff' }}>
          {titles.primary}
        </ThemedText>
        <ThemedText
          variant="captionSmall"
          numberOfLines={1}
          style={{ color: 'rgba(255,255,255,0.78)' }}>
          {`EP ${spot.ep}`}
        </ThemedText>
        <AnitabiOriginCredit
          source={spot}
          variant="inline"
          textVariant="captionSmall"
          color="rgba(255,255,255,0.7)"
        />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderRightWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    paddingTop: 8,
  },
  header: {
    paddingBottom: 10,
  },
  handle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.25)',
    marginBottom: 10,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
  loadingWrap: {
    height: TILE_HEIGHT + 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listContent: {
    paddingVertical: 8,
    paddingHorizontal: 4,
    gap: 10,
  },
  tile: {
    width: TILE_WIDTH,
    height: TILE_HEIGHT,
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  tileImage: {
    width: '100%',
    height: '100%',
  },
  activeBadge: {
    position: 'absolute',
    top: 6,
    left: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  tileCaption: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 8,
    paddingVertical: 6,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
});
