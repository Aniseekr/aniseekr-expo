import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Slider from '@react-native-community/slider';
import Ionicons from '@expo/vector-icons/Ionicons';
import { readableTextOn, ThemedText } from '../../../themed';
import { hapticsBridge } from '../../../../modules/haptics/hapticsBridge';
import type { OverlayMode } from '../types';

interface OverlayChipProps {
  mode: OverlayMode;
  opacity: number;
  flipped: boolean;
  themeColor: string;
  /** When true, panel opens to the LEFT of the chip (right-edge dock). */
  isLandscape?: boolean;
  onSelectMode: (mode: OverlayMode) => void;
  onChangeOpacity: (opacity: number) => void;
  onToggleFlip: () => void;
}

interface ModeMeta {
  id: OverlayMode;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
}

const MODES: ModeMeta[] = [
  { id: 'anime', icon: 'image-outline', label: 'Anime' },
  { id: 'sketch', icon: 'pencil-outline', label: 'Sketch' },
  { id: 'edge', icon: 'analytics-outline', label: 'Edge' },
];

export default function OverlayChip({
  mode,
  opacity,
  flipped,
  themeColor,
  isLandscape = false,
  onSelectMode,
  onChangeOpacity,
  onToggleFlip,
}: OverlayChipProps) {
  const [expanded, setExpanded] = useState(false);
  const current = MODES.find((m) => m.id === mode) ?? MODES[0];

  const toggleExpanded = () => {
    hapticsBridge.selection();
    setExpanded((prev) => !prev);
  };

  const handleSelectMode = (next: OverlayMode) => {
    if (next === mode) return;
    hapticsBridge.selection();
    onSelectMode(next);
  };

  const handleFlip = () => {
    hapticsBridge.tap();
    onToggleFlip();
  };

  return (
    <View style={styles.wrap}>
      {expanded ? (
        // Transparent backdrop catches taps outside the panel to collapse —
        // sized to cover the screen so taps anywhere off-chip close it.
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={toggleExpanded}
          accessibilityRole="button"
          accessibilityLabel="Close overlay options"
        />
      ) : null}

      <Pressable
        onPress={toggleExpanded}
        accessibilityRole="button"
        accessibilityLabel={`Overlay ${current.label}, ${Math.round(opacity * 100)} percent`}
        accessibilityState={{ expanded }}
        style={({ pressed }) => [styles.chip, pressed && { opacity: 0.75 }]}>
        <Ionicons name={current.icon} size={16} color="#fff" />
        <ThemedText
          variant="caption"
          weight="600"
          style={styles.chipText}>
          {Math.round(opacity * 100)}%
        </ThemedText>
      </Pressable>

      {expanded ? (
        <View style={[styles.panel, isLandscape && styles.panelLandscape]}>
          <View style={styles.row}>
            {MODES.map((m) => {
              const active = m.id === mode;
              return (
                <Pressable
                  key={m.id}
                  onPress={() => handleSelectMode(m.id)}
                  accessibilityRole="button"
                  accessibilityLabel={`Overlay mode ${m.label}`}
                  accessibilityState={{ selected: active }}
                  style={({ pressed }) => [
                    styles.modePill,
                    active && { backgroundColor: themeColor, borderColor: themeColor },
                    pressed && { opacity: 0.75 },
                  ]}>
                  <Ionicons
                    name={m.icon}
                    size={14}
                    color={active ? readableTextOn(themeColor) : '#fff'}
                  />
                  <ThemedText
                    variant="captionSmall"
                    weight="600"
                    style={{ color: active ? readableTextOn(themeColor) : '#fff' }}>
                    {m.label}
                  </ThemedText>
                </Pressable>
              );
            })}
          </View>

          <View style={styles.sliderRow}>
            <ThemedText
              variant="captionSmall"
              weight="600"
              style={styles.sliderLabel}>
              {Math.round(opacity * 100)}%
            </ThemedText>
            <Slider
              style={styles.slider}
              minimumValue={0}
              maximumValue={1}
              value={opacity}
              onValueChange={onChangeOpacity}
              minimumTrackTintColor={themeColor}
              maximumTrackTintColor="rgba(255,255,255,0.25)"
              thumbTintColor="#fff"
              accessibilityLabel="Overlay opacity"
            />
          </View>

          <Pressable
            onPress={handleFlip}
            accessibilityRole="button"
            accessibilityLabel="Flip overlay horizontally"
            accessibilityState={{ selected: flipped }}
            style={({ pressed }) => [
              styles.flipBtn,
              flipped && { backgroundColor: themeColor, borderColor: themeColor },
              pressed && { opacity: 0.75 },
            ]}>
            <Ionicons
              name="swap-horizontal"
              size={14}
              color={flipped ? readableTextOn(themeColor) : '#fff'}
            />
            <ThemedText
              variant="captionSmall"
              weight="600"
              style={{ color: flipped ? readableTextOn(themeColor) : '#fff' }}>
              Flip
            </ThemedText>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'relative',
  },
  // rgba scrim sits over live camera — no theme surface below.
  chip: {
    height: 44,
    width: 110,
    borderRadius: 22,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  chipText: {
    color: '#fff',
  },
  // Panel opens BELOW the chip in portrait; in landscape we anchor it to the
  // LEFT of the chip so it doesn't clip behind the ShutterRow rail. Caller
  // passes `isLandscape` to flip.
  panel: {
    position: 'absolute',
    top: 52,
    left: 0,
    width: 280,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    gap: 8,
  },
  panelLandscape: {
    left: undefined,
    right: 52,
    top: 0,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 6,
  },
  modePill: {
    flex: 1,
    minHeight: 36,
    minWidth: 44,
    borderRadius: 12,
    paddingHorizontal: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
    backgroundColor: 'transparent',
  },
  sliderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 44,
  },
  sliderLabel: {
    color: '#fff',
    width: 40,
  },
  slider: {
    flex: 1,
    height: 36,
  },
  flipBtn: {
    minHeight: 44,
    borderRadius: 12,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
    backgroundColor: 'transparent',
  },
});
