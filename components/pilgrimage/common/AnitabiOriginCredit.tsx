// AnitabiOriginCredit — per-screenshot attribution line for Anitabi data.
//
// Anitabi publishes scene screenshots under CC BY-NC-SA 4.0; any place that
// renders a `point.image` MUST also surface the contributor's name (and link
// it back to the originator's URL when one is available). This component is
// the single source of truth for that line: callers pass the point (or an
// {origin, originURL} pair) and we render — or render nothing when there is
// no attribution data.
//
// Use `compact` (the default) for in-grid / sheet footers; `inline` strips
// padding so the line can sit flush against a caption.

import React, { useCallback } from 'react';
import { Linking, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { ThemedText } from '../../themed';
import type { ThemedTextTone, ThemedTextVariant } from '../../themed/ThemedText';

export interface AnitabiOriginCreditSource {
  origin?: string | null;
  originURL?: string | null;
}

export interface AnitabiOriginCreditProps {
  /** A point or any object that exposes `origin` / `originURL`. */
  source: AnitabiOriginCreditSource | null | undefined;
  /**
   * Visual density:
   * - `compact` (default): small padded pill with a camera icon.
   * - `inline`: no padding, no icon — for tight captions / overlays.
   */
  variant?: 'compact' | 'inline';
  /** Override the colour tone. Defaults to `tertiary` on dark, `secondary` on light overlays. */
  tone?: ThemedTextTone;
  /** Override the text size. Defaults to `captionSmall`. */
  textVariant?: ThemedTextVariant;
  /** Optional inline colour (use when on top of an image overlay where tone tokens don't fit). */
  color?: string;
  /** Optional container override (margin/padding tweaks). */
  style?: StyleProp<ViewStyle>;
}

/**
 * Render the "📷 via {origin}" credit when the point has attribution data.
 * Returns null otherwise so callers can mount it unconditionally.
 */
export function AnitabiOriginCredit({
  source,
  variant = 'compact',
  tone = 'tertiary',
  textVariant = 'captionSmall',
  color,
  style,
}: AnitabiOriginCreditProps) {
  const origin = typeof source?.origin === 'string' ? source.origin.trim() : '';
  const originURL = typeof source?.originURL === 'string' ? source.originURL.trim() : '';

  const handlePress = useCallback(() => {
    if (!originURL) return;
    Haptics.selectionAsync().catch(() => undefined);
    Linking.openURL(originURL).catch(() => undefined);
  }, [originURL]);

  if (!origin) return null;

  const label = `via ${origin}`;
  const showIcon = variant === 'compact';
  const iconColor = color ?? undefined;

  const body = (
    <View style={[styles.row, variant === 'compact' && styles.compactPad, style]}>
      {showIcon ? (
        <Ionicons
          name="camera-outline"
          size={textVariant === 'captionSmall' ? 11 : 12}
          color={iconColor ?? 'rgba(255,255,255,0.62)'}
        />
      ) : null}
      <ThemedText
        variant={textVariant}
        weight="600"
        numberOfLines={1}
        tone={tone}
        style={[styles.label, color ? { color } : null]}>
        {label}
      </ThemedText>
      {originURL ? (
        <Ionicons
          name="open-outline"
          size={textVariant === 'captionSmall' ? 10 : 12}
          color={iconColor ?? 'rgba(255,255,255,0.62)'}
        />
      ) : null}
    </View>
  );

  if (!originURL) return body;

  return (
    <Pressable
      onPress={handlePress}
      accessibilityRole="link"
      accessibilityLabel={`Image source: ${origin}. Opens originator link.`}
      hitSlop={6}
      style={({ pressed }) => [pressed && { opacity: 0.6 }]}>
      {body}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flexShrink: 1,
  },
  compactPad: {
    paddingVertical: 2,
  },
  label: {
    flexShrink: 1,
  },
});
