// Visual indicator for the auto-capture countdown. The parent (the camera
// screen) positions the badge; this component only renders the pill and its
// progress bar. Rule 8: when remainingMs is null we render nothing — no
// "Standing by" placeholder, no fake countdown.
import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import { ThemedText } from '../../themed';

export interface AutoCaptureBadgeProps {
  /** ms remaining before fire; null = not arming, render nothing. */
  remainingMs: number | null;
  /** Total ms in the sustain window — used to compute progress fill. */
  sustainMs: number;
  /** Accent color from theme; drives the progress bar fill. */
  themeColor: string;
}

function AutoCaptureBadgeComponent({ remainingMs, sustainMs, themeColor }: AutoCaptureBadgeProps) {
  if (remainingMs === null) return null;

  // Clamp progress to [0,1]; ms can briefly go slightly negative between the
  // last tick and the fire callback, and we never want a >100% fill.
  const safeRemaining = Math.max(0, remainingMs);
  const denom = sustainMs > 0 ? sustainMs : 1;
  const progress = Math.min(1, Math.max(0, 1 - safeRemaining / denom));
  const seconds = (safeRemaining / 1000).toFixed(1);

  return (
    <View
      style={styles.pill}
      accessibilityRole="progressbar"
      accessibilityLabel={`Auto capture in ${seconds} seconds`}
      accessibilityValue={{ min: 0, max: sustainMs, now: Math.round(sustainMs - safeRemaining) }}
      pointerEvents="none">
      <View style={styles.labelRow}>
        <ThemedText variant="bodySmall" weight="700" style={styles.label}>
          {`Auto-fire ${seconds}s`}
        </ThemedText>
      </View>
      <View style={styles.barTrack}>
        <View
          style={[
            styles.barFill,
            { backgroundColor: themeColor, width: `${progress * 100}%` },
          ]}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    // Compact pill the parent positions absolutely; bounded so it never
    // grows past the 160×40 brief.
    minWidth: 132,
    maxWidth: 160,
    height: 40,
    borderRadius: 20,
    // Dark scrim so the white label and accent bar are legible over any
    // camera preview. Not a theme surface — this lives over the camera
    // viewfinder, which is always effectively dark mode.
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingHorizontal: 14,
    paddingVertical: 6,
    justifyContent: 'space-between',
    overflow: 'hidden',
  },
  labelRow: {
    flex: 1,
    justifyContent: 'center',
  },
  label: {
    // White against the dark scrim — analogous to the ON_DARK constant in
    // themed/contrast.ts. Hardcoded because the scrim is always dark.
    color: '#FFFFFF',
    textAlign: 'center',
  },
  barTrack: {
    height: 3,
    borderRadius: 1.5,
    backgroundColor: 'rgba(255,255,255,0.18)',
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: 1.5,
  },
});

export const AutoCaptureBadge = memo(AutoCaptureBadgeComponent);
export default AutoCaptureBadge;
