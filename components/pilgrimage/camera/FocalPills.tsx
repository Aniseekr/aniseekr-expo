import { Pressable, StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { ThemedText, readableTextOn } from '../../themed';
import { useTheme } from '../../../context/ThemeContext';
import { hapticsBridge } from '../../../modules/haptics/hapticsBridge';
import type { FocalStop } from './types';

const DEFAULT_STOPS: FocalStop[] = [0.5, 1, 2, 3];
const FRONT_FACING_STOPS: FocalStop[] = [1];

/**
 * Renders 0.5x / 1x / 2x / 3x focal stop pills over the live camera preview.
 *
 * `availableStops` semantics (truth about the device):
 * - `undefined` → use the legacy default (`[0.5,1,2,3]` rear, `[1]` front-facing).
 *   Suitable when the caller doesn't know real device capabilities (e.g. before
 *   `getAvailableLensesAsync` resolves) AND is driving digital zoom only.
 * - `[]` (empty array) → render nothing. The device has no optical zoom and the
 *   caller has opted out of digital-only fallback display.
 * - Single entry (e.g. `[1]`) → still render that one pill — gives "lens lock"
 *   feedback even though there is nothing to switch to.
 * - Multiple entries → render the row as today.
 *
 * `opticalHint` toggles a small "OPTICAL" label above the row to signal real
 * lens switching is active (vs. digital zoom). Caller passes `hasOpticalZoom`
 * from `useLensSwitcher`.
 */
interface FocalPillsProps {
  activeStop: FocalStop | null;
  onPick: (stop: FocalStop) => void;
  themeColor: string;
  availableStops?: FocalStop[];
  isFrontFacing?: boolean;
  opticalHint?: boolean;
  /**
   * Virtual / auto-switching lenses (builtInDual/Triple…) the device exposes.
   * When non-empty, FocalPills appends an "AUTO" pill that lets iOS pick the
   * best underlying optical lens. Empty/undefined → no AUTO pill rendered.
   */
  virtualLenses?: string[];
  /** Tap handler for the AUTO pill. Required when `virtualLenses` is non-empty. */
  onPickVirtual?: () => void;
  /** Highlight the AUTO pill when the active selectedLens is virtual. */
  virtualActive?: boolean;
}

function formatStop(stop: FocalStop): string {
  // Drop trailing zeros: 0.5x, 1x, 2x, 3x.
  return `${stop}x`;
}

export default function FocalPills({
  activeStop,
  onPick,
  themeColor,
  availableStops,
  isFrontFacing = false,
  opticalHint = false,
  virtualLenses,
  onPickVirtual,
  virtualActive = false,
}: FocalPillsProps) {
  const { theme } = useTheme();
  const stops =
    availableStops ?? (isFrontFacing ? FRONT_FACING_STOPS : DEFAULT_STOPS);
  const activeFg = readableTextOn(themeColor);
  const showAutoPill = (virtualLenses?.length ?? 0) > 0 && typeof onPickVirtual === 'function';

  // Empty stops AND no AUTO pill = truth-respecting hide. If the device offers
  // a virtual lens stack we still show the row so the user can engage AUTO.
  if (stops.length === 0 && !showAutoPill) return null;

  return (
    <View style={styles.container}>
      {opticalHint ? (
        <ThemedText
          variant="captionSmall"
          weight="700"
          align="center"
          tone="tertiary"
          style={styles.opticalLabel}>
          OPTICAL
        </ThemedText>
      ) : null}
      <View style={styles.row}>
        {stops.map((stop) => {
          // activeStop === null means user is between stops — highlight nothing
          // rather than lie about which stop is "selected".
          // A virtual lens being active outranks any focal-stop highlight: the
          // user has handed control to iOS, so no single physical stop owns
          // the active state.
          const isActive = !virtualActive && activeStop !== null && stop === activeStop;
          return (
            <Pressable
              key={stop}
              onPress={() => {
                hapticsBridge.selection();
                onPick(stop);
              }}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel={`${formatStop(stop)} zoom`}
              accessibilityState={{ selected: isActive }}
              style={({ pressed }) => [
                styles.pill,
                {
                  // rgba scrim — pill sits over the live camera preview, no theme
                  // surface beneath. Allowed per CLAUDE.md.
                  backgroundColor: isActive ? themeColor : 'rgba(0,0,0,0.45)',
                  borderColor: theme.glassBorder,
                },
                pressed && { opacity: 0.7 },
              ]}>
              <ThemedText
                variant="caption"
                weight="700"
                align="center"
                style={{ color: isActive ? activeFg : '#fff' }}>
                {formatStop(stop)}
              </ThemedText>
            </Pressable>
          );
        })}
        {showAutoPill ? (
          <Pressable
            onPress={() => {
              hapticsBridge.selection();
              onPickVirtual?.();
            }}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel="Auto lens"
            accessibilityState={{ selected: virtualActive }}
            style={({ pressed }) => [
              styles.pill,
              {
                backgroundColor: virtualActive ? themeColor : 'rgba(0,0,0,0.45)',
                borderColor: theme.glassBorder,
              },
              pressed && { opacity: 0.7 },
            ]}>
            <Ionicons
              name="aperture-outline"
              size={16}
              color={virtualActive ? activeFg : '#fff'}
            />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
  },
  opticalLabel: {
    marginBottom: 8,
    fontSize: 9,
    letterSpacing: 1.5,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  pill: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
