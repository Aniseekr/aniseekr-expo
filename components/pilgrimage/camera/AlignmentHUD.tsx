import { useEffect, useRef } from 'react';
import { Animated as RNAnimated, Pressable, StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTheme } from '../../../context/ThemeContext';
import { ThemedText } from '../../themed';
import { CAMERA_TOP_BAR_CONTENT_HEIGHT } from '../../../libs/services/pilgrimage/camera-ui';
import { CameraChrome, cameraControlShadow } from './cameraChrome';
import type { AlignmentScoreView } from './types';

interface AlignmentHUDProps {
  score: AlignmentScoreView;
  themeColor: string;
  topInset: number;
  bottomInset: number;
  /** Height of the slim bottom bar — the perfect banner docks above it. */
  bottomBarHeight: number;
  /** Right-edge reserve (landscape shutter cluster) so right-anchored badges clear it. */
  rightReserve: number;
  isLandscape: boolean;
  transformed: boolean;
  rotationDisplayDeg: number;
  showPerfectBanner: boolean;
  onReset: () => void;
}

// A match this close reads as "aligned" — the badge turns green with a check.
const ALIGNED_THRESHOLD = 0.85;

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

/**
 * The alignment readout. A single badge sits below the top bar on the right:
 * while the framing is off it shows the live %, distance and heading delta so
 * the user knows what to fix; once aligned it collapses to a green "Aligned"
 * check. The reposition chips (reset / rotation) sit centered below the bar,
 * clear of the reference thumbnail on the left and the badge on the right.
 */
export default function AlignmentHUD({
  score,
  themeColor,
  topInset,
  bottomInset,
  bottomBarHeight,
  rightReserve,
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
  const aligned = score.total !== null && score.total >= ALIGNED_THRESHOLD;
  const showRotationBadge = Math.abs(rotationDisplayDeg) > 0;
  // Badges and chips anchor just below Row 1 of the top bar.
  const rowTop = topInset + CAMERA_TOP_BAR_CONTENT_HEIGHT + 8;

  return (
    <>
      {score.total !== null ? (
        <View
          pointerEvents="none"
          style={[styles.alignChipWrap, { top: rowTop, right: rightReserve + 14 }]}>
          <View
            style={[
              styles.alignChip,
              {
                // White text over either the success green or the dark scrim.
                backgroundColor: aligned ? theme.status.success : CameraChrome.controlFill,
                borderColor: aligned ? theme.status.success : CameraChrome.border,
              },
            ]}>
            <Ionicons name={aligned ? 'checkmark-circle' : 'navigate'} size={13} color="#fff" />
            <ThemedText
              variant="captionSmall"
              weight="700"
              style={{ color: '#fff', letterSpacing: 0.3 }}>
              {aligned
                ? `Aligned · ${percentText}`
                : `${percentText} · ${formatDistance(score.distanceMeters)} · ${formatHeadingDelta(
                    score.headingDeltaDeg
                  )}`}
            </ThemedText>
          </View>
        </View>
      ) : null}

      {transformed || showRotationBadge ? (
        <View style={[styles.repositionRow, { top: rowTop }]} pointerEvents="box-none">
          {showRotationBadge ? (
            <View style={[styles.rotationBadge, { borderColor: themeColor }]} pointerEvents="none">
              <Ionicons name="sync" size={12} color={themeColor} />
              <ThemedText variant="captionSmall" weight="700" style={{ color: theme.text.primary }}>
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
              style={({ pressed }) => [styles.resetChip, pressed && { opacity: 0.7 }]}>
              <Ionicons name="refresh" size={14} color="#fff" />
              <ThemedText variant="captionSmall" weight="700" style={{ color: '#fff' }}>
                Reset
              </ThemedText>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {showPerfectBanner ? (
        <RNAnimated.View
          pointerEvents="none"
          style={[
            styles.perfectBanner,
            isLandscape
              ? { bottom: bottomInset + 28, left: '14%', right: rightReserve + 24 }
              : { bottom: bottomBarHeight + 20, left: '12%', right: '12%' },
            { backgroundColor: theme.status.success, opacity: perfectOpacity },
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
  alignChipWrap: {
    position: 'absolute',
    zIndex: 65,
  },
  alignChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    ...cameraControlShadow,
  },
  repositionRow: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    zIndex: 65,
  },
  rotationBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: CameraChrome.controlFill,
    borderWidth: 1,
    ...cameraControlShadow,
  },
  resetChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: CameraChrome.controlFill,
    borderWidth: 1,
    borderColor: CameraChrome.border,
    ...cameraControlShadow,
  },
  perfectBanner: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 999,
    zIndex: 65,
  },
});
