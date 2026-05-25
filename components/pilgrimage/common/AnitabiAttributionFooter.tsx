// AnitabiAttributionFooter — bottom-of-list call-to-action that links users
// out to anitabi.cn for either browsing the full map or contributing a new
// landmark. Satisfies CC BY-NC-SA 4.0 attribution at the data-set level and
// also doubles as a contributor-acquisition surface (per CC's NC clause we
// link the upstream community back to its source).
//
// Two variants:
//   • `default` — full block with title, both buttons and credit line. Use
//     at the bottom of a detail/list screen.
//   • `empty`   — slimmer variant tuned for the empty state (no landmarks
//     for this anime yet → encourage the user to look at the full map or
//     contribute). Same buttons, different framing copy.
//   • `footer`  — single-line credit + map button, for tab/index footers.

import React, { useCallback } from 'react';
import { Linking, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ThemedButton, ThemedText, readableTextOn } from '../../themed';
import { useTheme } from '../../../context/ThemeContext';
import { Spacing } from '../../../constants/DesignSystem';
import { buildAnitabiMapUrl, getAnitabiSiteUrl } from '../detail/_helpers';

export interface AnitabiAttributionFooterProps {
  bangumiId: number | null;
  variant?: 'default' | 'empty' | 'footer';
}

export function AnitabiAttributionFooter({
  bangumiId,
  variant = 'default',
}: AnitabiAttributionFooterProps) {
  const { theme } = useTheme();
  const mapUrl =
    typeof bangumiId === 'number' && Number.isFinite(bangumiId) && bangumiId > 0
      ? buildAnitabiMapUrl(bangumiId)
      : getAnitabiSiteUrl();

  const openMap = useCallback(() => {
    Linking.openURL(mapUrl).catch(() => undefined);
  }, [mapUrl]);
  const openContribute = useCallback(() => {
    // Anitabi has no dedicated /contribute page — contributors click an empty
    // coordinate on the web map to submit a new landmark, so we land them on
    // the same map page with the same anime context preloaded.
    Linking.openURL(mapUrl).catch(() => undefined);
  }, [mapUrl]);
  const openSite = useCallback(() => {
    Linking.openURL(getAnitabiSiteUrl()).catch(() => undefined);
  }, []);

  if (variant === 'footer') {
    return (
      <View style={[styles.footerRow, { borderTopColor: theme.glassBorder }]}>
        <Ionicons name="map-outline" size={13} color={theme.text.tertiary} />
        <ThemedText variant="captionSmall" tone="tertiary" numberOfLines={1} style={styles.footerLabel}>
          {'Pilgrimage data by Anitabi'}
        </ThemedText>
        <ThemedText
          variant="captionSmall"
          weight="700"
          tone="accent"
          onPress={openMap}
          accessibilityRole="link"
          accessibilityLabel="View full map on Anitabi"
          style={styles.footerLink}>
          {'View on Anitabi ›'}
        </ThemedText>
      </View>
    );
  }

  const isEmpty = variant === 'empty';
  const primaryFg = readableTextOn(theme.accent);
  return (
    <View
      style={[
        styles.block,
        {
          borderColor: theme.glassBorder,
          backgroundColor: theme.background.secondary,
        },
      ]}>
      <View style={styles.headingRow}>
        <Ionicons name="map" size={16} color={theme.accent} />
        <ThemedText variant="titleSmall" weight="700">
          {isEmpty ? 'Help map this anime' : 'See the full map on Anitabi'}
        </ThemedText>
      </View>
      <ThemedText variant="bodySmall" tone="secondary">
        {isEmpty
          ? "We couldn't find landmarks for this anime yet. View Anitabi's web map to look around, or submit a spot you've discovered."
          : 'Anitabi maps every reported scene. Open the web map for the full view, or click an empty coordinate there to contribute a new landmark.'}
      </ThemedText>
      <View style={styles.buttonRow}>
        <View style={styles.buttonHalf}>
          <ThemedButton
            label="View on Anitabi"
            onPress={openMap}
            size="md"
            variant="primary"
            fullWidth
            icon={<Ionicons name="open-outline" size={16} color={primaryFg} />}
          />
        </View>
        <View style={styles.buttonHalf}>
          <ThemedButton
            label="Contribute a spot"
            onPress={openContribute}
            size="md"
            variant="secondary"
            fullWidth
            icon={<Ionicons name="add-circle-outline" size={16} color={theme.text.primary} />}
          />
        </View>
      </View>
      <ThemedText
        variant="captionSmall"
        tone="tertiary"
        onPress={openSite}
        accessibilityRole="link"
        accessibilityLabel="Open Anitabi homepage"
        style={styles.credit}>
        {'Data licensed CC BY-NC-SA 4.0 · anitabi.cn'}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  block: {
    marginHorizontal: Spacing.screenPadding,
    marginTop: Spacing.lg,
    marginBottom: Spacing.lg,
    padding: Spacing.md,
    borderRadius: 16,
    borderWidth: 1,
    gap: Spacing.sm,
  },
  headingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: 4,
  },
  buttonHalf: {
    flex: 1,
  },
  credit: {
    marginTop: 4,
    textDecorationLine: 'underline',
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    gap: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  footerLabel: {
    flex: 1,
  },
  footerLink: {
    marginLeft: 8,
  },
});
