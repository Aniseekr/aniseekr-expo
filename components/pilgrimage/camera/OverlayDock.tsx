import { useEffect, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { readableTextOn } from '../../themed';
import { hapticsBridge } from '../../../modules/haptics/hapticsBridge';

// The floating square sits just above the slim bottom bar; the panel floats
// clear above the square so the square never covers a control.
const SQUARE_SIZE = 52;
const SQUARE_MARGIN = 16;
const PANEL_GAP = 10;

interface OverlayDockProps {
  /** Whether the slide-up overlay panel is expanded. */
  open: boolean;
  onToggle: () => void;
  themeColor: string;
  isLandscape: boolean;
  /** Height of the slim bottom bar — the dock seats just above it (portrait). */
  bottomBarHeight: number;
  /** Safe-area bottom pad — seats the dock in landscape (no bottom bar there). */
  bottomPad: number;
  /** Landscape reserves this much on the right for the floating shutter cluster. */
  clusterReserve: number;
  leftInset: number;
  rightInset: number;
  /** The overlay controls body — mode pills, opacity slider, reposition/flip. */
  children: ReactNode;
}

/**
 * The overlay-controls dock. A small floating square (bottom-right) toggles a
 * slide-up panel that hosts the overlay mode + opacity controls, keeping the
 * bottom bar slim. rgba / #000 chrome is allowed — the dock floats over the
 * live camera preview, not a theme surface.
 */
export default function OverlayDock({
  open,
  onToggle,
  themeColor,
  isLandscape,
  bottomBarHeight,
  bottomPad,
  clusterReserve,
  leftInset,
  rightInset,
  children,
}: OverlayDockProps) {
  const progress = useSharedValue(open ? 1 : 0);

  useEffect(() => {
    progress.value = withTiming(open ? 1 : 0, { duration: 220 });
  }, [open, progress]);

  const panelStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: (1 - progress.value) * 14 }],
  }));

  // The dock seats above the slim bottom bar in portrait; in landscape there is
  // no bottom bar, so it seats on the safe-area pad and clears the right cluster.
  const squareBottom = (isLandscape ? bottomPad : bottomBarHeight) + SQUARE_MARGIN - 4;
  const squareRight = (isLandscape ? clusterReserve + rightInset : rightInset) + SQUARE_MARGIN;
  const panelBottom = squareBottom + SQUARE_SIZE + PANEL_GAP;
  const panelLeft = leftInset + SQUARE_MARGIN;

  const handleToggle = () => {
    hapticsBridge.selection();
    onToggle();
  };

  const squareFg = open ? readableTextOn(themeColor) : '#fff';

  return (
    <>
      <Animated.View
        pointerEvents={open ? 'auto' : 'none'}
        style={[
          styles.panel,
          { bottom: panelBottom, left: panelLeft, right: squareRight },
          panelStyle,
        ]}>
        <View style={styles.panelCard}>
          <View style={styles.handle} />
          <ScrollView
            style={{ maxHeight: isLandscape ? 220 : 340 }}
            contentContainerStyle={styles.panelBody}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled">
            {children}
          </ScrollView>
        </View>
      </Animated.View>

      <Pressable
        onPress={handleToggle}
        accessibilityRole="button"
        accessibilityLabel={open ? 'Hide overlay controls' : 'Show overlay controls'}
        accessibilityState={{ expanded: open }}
        style={({ pressed }) => [
          styles.square,
          {
            bottom: squareBottom,
            right: squareRight,
            backgroundColor: open ? themeColor : 'rgba(0,0,0,0.62)',
            borderColor: open ? themeColor : 'rgba(255,255,255,0.28)',
          },
          pressed && { opacity: 0.82 },
        ]}>
        <Ionicons name="layers" size={19} color={squareFg} />
        <Ionicons
          name={open ? 'chevron-down' : 'chevron-up'}
          size={12}
          color={open ? squareFg : 'rgba(255,255,255,0.78)'}
        />
      </Pressable>
    </>
  );
}

const styles = StyleSheet.create({
  panel: {
    position: 'absolute',
    zIndex: 90,
  },
  // Near-opaque card so the live camera + anime overlay can't bleed through
  // behind the controls (matches the old tool popover surface). Alpha 0.95
  // gives a touch more opacity than the previous 0.9 — readable against the
  // brighter anime overlays without going full black.
  panelCard: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    backgroundColor: 'rgba(0,0,0,0.95)',
    overflow: 'hidden',
    paddingTop: 8,
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 14,
  },
  handle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.3)',
    marginBottom: 4,
  },
  panelBody: { padding: 14 },
  square: {
    position: 'absolute',
    zIndex: 95,
    width: SQUARE_SIZE,
    height: SQUARE_SIZE,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 1,
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 10,
  },
});
