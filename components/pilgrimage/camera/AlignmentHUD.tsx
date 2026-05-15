import { useEffect, useRef } from 'react';
import { Animated as RNAnimated, Pressable, StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTheme } from '../../../context/ThemeContext';
import { ThemedText, readableTextOn } from '../../themed';
import type { AlignmentScoreView } from './types';

interface AlignmentHUDProps {
  score: AlignmentScoreView;
  themeColor: string;
  topInset: number;
  bottomInset: number;
  isLandscape: boolean;
  transformed: boolean;
  rotationDisplayDeg: number;
  showPerfectBanner: boolean;
  onReset: () => void;
}

function formatPercent(total: number | null): string {
  if (total === null) return '—';
  return `${Math.round(total * 100)}%`;
}

function formatDistance(meters: number | null): string {
  if (meters === null) return '—';
  if (meters < 100) return `${meters.toFixed(1)}m`;
  return `${Math.round(meters)}m`;
}

function formatHeadingDelta(deg: number | null): string {
  if (deg === null) return '—';
  const rounded = Math.round(deg);
  return `${rounded > 0 ? '+' : ''}${rounded}°`;
}

export default function AlignmentHUD({
  score,
  themeColor,
  topInset,
  bottomInset,
  isLandscape,
  transformed,
  rotationDisplayDeg,
  showPerfectBanner,
  onReset,
}: AlignmentHUDProps) {
  const { theme } = useTheme();
  const perfectOpacity = useRef(new RNAnimated.Value(showPerfectBanner ? 1 : 0)).current;

  useEffect(() => {
    RNAnimated.timing(perfectOpacity, {
      toValue: showPerfectBanner ? 1 : 0,
      duration: 200,
      useNativeDriver: true,
    }).start();
  }, [showPerfectBanner, perfectOpacity]);

  const percentText = formatPercent(score.total);
  const distanceText = formatDistance(score.distanceMeters);
  const headingDeltaText = formatHeadingDelta(score.headingDeltaDeg);
  const isPerfect = score.total !== null && score.total >= 0.9;
  const showRotationBadge = Math.abs(rotationDisplayDeg) > 0;
  const chipBg = isPerfect ? themeColor : theme.background.secondary;
  const chipFg = isPerfect ? readableTextOn(themeColor) : theme.text.primary;
  const chipBorder = isPerfect ? themeColor : theme.glassBorder;

  return (
    <>
      {score.total !== null ? (
        <View style={[styles.liveBadgeWrap, { top: topInset + 64 }]}>
          <View style={styles.liveBadge}>
            <View style={styles.liveDot} />
            {/* White text over translucent dark scrim — allowed exception. */}
            <ThemedText
              variant="captionSmall"
              weight="700"
              style={{ color: '#fff', letterSpacing: 1 }}>
              {`LIVE · ${percentText}`}
            </ThemedText>
          </View>
        </View>
      ) : null}

      {showRotationBadge ? (
        <View
          style={[
            styles.rotationBadge,
            {
              top: topInset + 64,
              right: isLandscape ? 90 : 14,
              borderColor: themeColor,
            },
          ]}
          pointerEvents="none">
          <Ionicons name="sync" size={12} color={themeColor} />
          <ThemedText
            variant="captionSmall"
            weight="700"
            style={{ color: theme.text.primary }}>
            {`${rotationDisplayDeg > 0 ? '+' : ''}${rotationDisplayDeg}°`}
          </ThemedText>
        </View>
      ) : null}

      {transformed ? (
        <Pressable
          onPress={onReset}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Reset overlay position"
          style={({ pressed }) => [
            styles.resetChip,
            { top: topInset + 64, opacity: pressed ? 0.7 : 1 },
          ]}>
          <Ionicons name="refresh" size={14} color="#fff" />
          <ThemedText
            variant="captionSmall"
            weight="700"
            style={{ color: '#fff' }}>
            Reset
          </ThemedText>
        </Pressable>
      ) : null}

      {score.total !== null ? (
        <View
          style={[
            isLandscape ? styles.alignmentChipWrapLandscape : styles.alignmentChipWrap,
            isLandscape
              ? { bottom: bottomInset + 24 }
              : { bottom: bottomInset + 156 },
          ]}
          pointerEvents="none">
          <View
            style={[
              styles.alignmentChip,
              {
                borderColor: chipBorder,
                backgroundColor: chipBg,
              },
            ]}>
            <Ionicons name="star" size={12} color={chipFg} />
            <ThemedText
              variant="captionSmall"
              weight="700"
              style={{ color: chipFg, letterSpacing: 0.5 }}>
              {`${percentText}  ·  ${distanceText}  ·  ${headingDeltaText}`}
            </ThemedText>
          </View>
        </View>
      ) : null}

      {showPerfectBanner ? (
        <RNAnimated.View
          pointerEvents="none"
          style={[
            styles.perfectBanner,
            // In landscape the right edge is reserved for the ShutterRow
            // control column — narrow the banner so it doesn't crash into it.
            isLandscape
              ? { top: topInset + 64, left: '10%', right: '40%' }
              : { bottom: bottomInset + 232 },
            {
              backgroundColor: theme.status.success,
              opacity: perfectOpacity,
            },
          ]}>
          {/* White text over success accent — readable per status.success contrast. */}
          <Ionicons name="checkmark-circle" size={18} color="#fff" />
          <ThemedText variant="bodySmall" weight="700" style={{ color: '#fff' }}>
            Position locked — shoot now
          </ThemedText>
        </RNAnimated.View>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  liveBadgeWrap: {
    position: 'absolute',
    left: 14,
    flexDirection: 'row',
  },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#FF3B30',
  },
  rotationBadge: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderWidth: 1,
  },
  resetChip: {
    position: 'absolute',
    left: 76,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.7)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  alignmentChipWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  alignmentChipWrapLandscape: {
    position: 'absolute',
    left: 14,
    flexDirection: 'row',
  },
  alignmentChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
  perfectBanner: {
    position: 'absolute',
    left: '15%',
    right: '15%',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 999,
  },
});
