// Styles for the pilgrimage detail route shell + its in-route children.
// The route uses a map-first layout: a full-bleed map with a stack of
// floating chrome on top (header buttons / search / chips / view mode
// toggle), and a persistent pull-up bottom sheet for the anime card +
// scene grid.
//
// Lifted out of `[animeId].tsx` so the route shell can stay near the
// < 500-line target for route files.

import { StyleSheet } from 'react-native';
import { Radius, Spacing, Typography } from '../../../constants/DesignSystem';
import type { ThemePalette } from '../../../context/ThemeContext';

// Kept for backwards-compat / tests that depend on these tokens. The new
// layout no longer uses HERO_HEIGHT (the parallax hero was removed when the
// route flipped to a map-first design with a pull-up sheet).
export const HERO_HEIGHT = 320;
export const HEADER_HEIGHT = 56;

// Approximate height of the floating segmented view-mode toggle that sits
// just above the bottom sheet handle. Used to pad the sheet peek so the
// toggle doesn't clip behind it.
export const VIEW_MODE_TOGGLE_HEIGHT = 52;

export function makePilgrimageDetailStyles(theme: ThemePalette, topInset: number) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.background.primary },
    loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    errorContainer: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: Spacing.xl,
      gap: Spacing.sm,
    },
    backBtn: {
      paddingHorizontal: Spacing.md,
      paddingVertical: Spacing.xs + 2,
      borderRadius: Radius.md,
    },

    // Map background — fills the screen behind every floating layer.
    mapBackground: {
      ...StyleSheet.absoluteFillObject,
    },
    mapBackgroundInner: {
      flex: 1,
    },
    mapScrim: {
      // Gentle scrim so the floating chrome reads against bright tiles
      // (e.g. light-mode street maps).
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(0,0,0,0.18)',
    },

    // Floating top-overlay stack (back/album/share + search + chip rows).
    topOverlay: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      paddingTop: topInset + Spacing.xs,
      paddingHorizontal: Spacing.screenPadding,
      gap: Spacing.sm,
    },
    headerActions: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    headerLeftGroup: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.sm,
      flexShrink: 1,
      minWidth: 0,
    },
    headerRightGroup: {
      flexDirection: 'row',
      gap: Spacing.sm,
    },

    // Floating search field.
    searchPill: {
      minHeight: 44,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingLeft: 14,
      paddingRight: 6,
      borderRadius: Radius.full,
      backgroundColor: `${theme.background.secondary}E6`,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.glassBorder,
    },
    searchInput: {
      flex: 1,
      minHeight: 42,
      paddingVertical: 0,
      ...Typography.bodyMedium,
      letterSpacing: 0,
    },
    searchClearBtn: {
      width: 32,
      height: 32,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
    },

    // Series + filter chip rows. Horizontal scrollable; first chip aligned
    // to the screen padding so it reads as an extension of the overlay.
    // Retained for any caller that still uses the old chip row.
    chipRow: {
      gap: Spacing.xs,
      paddingRight: Spacing.xs,
    },

    // Compact row used by the cycle pill — single pill centered above the
    // view-mode toggle. Replaces the multi-pill horizontal strip.
    filterCycleRow: {
      flexDirection: 'row',
      justifyContent: 'center',
      alignItems: 'center',
    },

    // Bottom chrome — wraps the filter strip + view-mode toggle in one
    // Animated.View that anchors to the bottom sheet's top edge so it
    // slides with the sheet rather than sitting at a fixed point.
    bottomChromeWrap: {
      position: 'absolute',
      left: 0,
      right: 0,
      paddingHorizontal: Spacing.screenPadding,
      gap: Spacing.xs,
    },
    viewModeWrapInner: {
      alignItems: 'center',
    },
    viewModeBar: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 4,
      paddingVertical: 4,
      borderRadius: Radius.full,
      backgroundColor: `${theme.background.primary}E0`,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.glassBorder,
    },
    viewModeSegment: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 14,
      height: 36,
      borderRadius: Radius.full,
    },
    viewModeSegmentBadge: {
      minWidth: 24,
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 11,
      alignItems: 'center',
      justifyContent: 'center',
    },

    // Map-side floating dock for marker mode + offline toggle.
    mapOptionsDock: {
      position: 'absolute',
      right: Spacing.screenPadding,
      flexDirection: 'column',
      gap: Spacing.xs,
    },

    // Error / fallback "no map data" hero — used in place of the map when
    // the anime has no geo (we still show the floating overlay + sheet,
    // but the map area becomes a gradient with a hint).
    fallbackMapHint: {
      position: 'absolute',
      top: '38%',
      left: 0,
      right: 0,
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: Spacing.screenPadding,
    },

    // Generic empty card retained for the loading/empty error state.
    emptyCard: {
      marginHorizontal: Spacing.screenPadding,
      marginTop: Spacing.lg,
      paddingVertical: Spacing.xl,
      paddingHorizontal: Spacing.lg,
      backgroundColor: theme.background.secondary,
      borderColor: theme.glassBorder,
      borderWidth: 1,
      borderRadius: Radius.cardLg,
      alignItems: 'center',
      gap: Spacing.xs,
    },
    emptyBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: Radius.full,
      marginTop: Spacing.xs,
    },
  });
}

export type PilgrimageDetailStyles = ReturnType<typeof makePilgrimageDetailStyles>;
