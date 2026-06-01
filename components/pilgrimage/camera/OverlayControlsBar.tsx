import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Slider from '@react-native-community/slider';
import Ionicons from '@expo/vector-icons/Ionicons';
import { ThemedText, readableTextOn } from '../../themed';
import { hapticsBridge } from '../../../modules/haptics/hapticsBridge';
import {
  EDGE_INTENSITIES,
  edgeIntensityLabel,
  type EdgeIntensity,
} from '../../../libs/services/pilgrimage/edge-overlay';
import { CameraChrome, cameraControlShadow } from './cameraChrome';
import type { OverlayMode } from './types';

type ModeOption = OverlayMode | 'off';

interface OverlayControlsBarProps {
  visible: boolean;
  mode: OverlayMode;
  edgeIntensity: EdgeIntensity;
  subjectCombine: boolean;
  characterSelected: boolean;
  opacity: number;
  flipped: boolean;
  editMode: boolean;
  themeColor: string;
  onSelectOff: () => void;
  onSelectMode: (mode: OverlayMode) => void;
  onSelectEdgeIntensity: (intensity: EdgeIntensity) => void;
  onToggleSubjectCombine: () => void;
  onOpenCharacterPicker: () => void;
  onChangeOpacity: (opacity: number) => void;
  onToggleFlip: () => void;
  onToggleEdit: () => void;
}

interface ModeMeta {
  id: ModeOption;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
}

const MODES: ModeMeta[] = [
  { id: 'off', icon: 'eye-off-outline', label: 'Off' },
  { id: 'anime', icon: 'image-outline', label: 'Anime' },
  { id: 'edge', icon: 'analytics-outline', label: 'Edge' },
  { id: 'sketch', icon: 'pencil-outline', label: 'Sketch' },
  { id: 'subject', icon: 'person-outline', label: 'Subject' },
];

/**
 * Overlay controls: a horizontal filter-strip for mode selection (scrollable,
 * like a camera filter picker), contextual sub-options, and an opacity slider.
 * All surfaces float over the live camera preview (camera-scrim exception).
 */
export default function OverlayControlsBar({
  visible,
  mode,
  edgeIntensity,
  subjectCombine,
  characterSelected,
  opacity,
  flipped,
  editMode,
  themeColor,
  onSelectOff,
  onSelectMode,
  onSelectEdgeIntensity,
  onToggleSubjectCombine,
  onOpenCharacterPicker,
  onChangeOpacity,
  onToggleFlip,
  onToggleEdit,
}: OverlayControlsBarProps) {
  const activeId: ModeOption = visible ? mode : 'off';

  const handlePickMode = (id: ModeOption) => {
    if (id === activeId) return;
    hapticsBridge.selection();
    if (id === 'off') onSelectOff();
    else onSelectMode(id);
  };

  const handleFlip = () => {
    hapticsBridge.tap();
    onToggleFlip();
  };

  return (
    <View style={styles.root} pointerEvents="box-none">
      {/* Filter strip — horizontal scroll, each mode is a natural-width pill */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.stripScroll}
        contentContainerStyle={styles.stripContent}>
        {MODES.map((m) => {
          const active = m.id === activeId;
          const fg = active ? readableTextOn(themeColor) : CameraChrome.fg;
          return (
            <Pressable
              key={m.id}
              onPress={() => handlePickMode(m.id)}
              accessibilityRole="button"
              accessibilityLabel={m.id === 'off' ? 'Hide overlay' : `Overlay mode ${m.label}`}
              accessibilityState={{ selected: active }}
              style={({ pressed }) => [
                styles.modePill,
                active && { backgroundColor: themeColor, borderColor: themeColor },
                pressed && !active && styles.pillPressed,
              ]}>
              <Ionicons name={m.icon} size={14} color={fg} />
              <ThemedText
                variant="captionSmall"
                weight="700"
                numberOfLines={1}
                style={{ color: fg }}>
                {m.label}
              </ThemedText>
            </Pressable>
          );
        })}
      </ScrollView>

      {visible && mode === 'edge' ? (
        <View style={styles.subRow}>
          <SubSegment
            icon="git-network-outline"
            options={EDGE_INTENSITIES.map((i) => ({ id: i, label: edgeIntensityLabel(i) }))}
            activeId={edgeIntensity}
            themeColor={themeColor}
            onPick={(id) => onSelectEdgeIntensity(id as EdgeIntensity)}
          />
        </View>
      ) : null}

      {visible && mode === 'subject' ? (
        <View style={styles.subRow}>
          <Pressable
            onPress={() => {
              hapticsBridge.selection();
              onToggleSubjectCombine();
            }}
            accessibilityRole="checkbox"
            accessibilityLabel="Combine subject overlay into the captured photo"
            accessibilityState={{ checked: subjectCombine }}
            style={({ pressed }) => [
              styles.combinePill,
              subjectCombine && { backgroundColor: themeColor, borderColor: themeColor },
              pressed && { opacity: 0.7 },
            ]}>
            <Ionicons
              name={subjectCombine ? 'checkmark-circle' : 'ellipse-outline'}
              size={14}
              color={subjectCombine ? readableTextOn(themeColor) : '#fff'}
            />
            <ThemedText
              variant="captionSmall"
              weight="700"
              style={{ color: subjectCombine ? readableTextOn(themeColor) : '#fff' }}>
              Combine
            </ThemedText>
          </Pressable>
          <Pressable
            onPress={() => {
              hapticsBridge.tap();
              onOpenCharacterPicker();
            }}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={characterSelected ? 'Swap character' : 'Pick character'}
            accessibilityState={{ selected: characterSelected }}
            style={({ pressed }) => [
              styles.characterPill,
              characterSelected && { backgroundColor: themeColor, borderColor: themeColor },
              pressed && { opacity: 0.7 },
            ]}>
            <Ionicons
              name={characterSelected ? 'person' : 'person-add-outline'}
              size={14}
              color={characterSelected ? readableTextOn(themeColor) : '#fff'}
            />
            <ThemedText
              variant="captionSmall"
              weight="700"
              numberOfLines={1}
              style={{ color: characterSelected ? readableTextOn(themeColor) : '#fff' }}>
              Character
            </ThemedText>
          </Pressable>
        </View>
      ) : null}

      <View
        style={[styles.opacityRow, !visible && styles.dimmed]}
        pointerEvents={visible ? 'auto' : 'none'}>
        <View style={styles.opacityPill}>
          <ThemedText variant="captionSmall" weight="600" style={styles.opacityLabel}>
            Overlay
          </ThemedText>
          <Slider
            style={styles.slider}
            minimumValue={0}
            maximumValue={1}
            value={opacity}
            onValueChange={onChangeOpacity}
            minimumTrackTintColor={themeColor}
            maximumTrackTintColor={CameraChrome.trackInactive}
            thumbTintColor="#fff"
            accessibilityLabel="Overlay opacity"
          />
          <ThemedText variant="captionSmall" weight="700" style={styles.opacityValue}>
            {Math.round(opacity * 100)}%
          </ThemedText>
        </View>

        <IconBtn
          icon={editMode ? 'lock-open-outline' : 'move-outline'}
          active={editMode}
          themeColor={themeColor}
          accessibilityLabel={editMode ? 'Lock overlay position' : 'Reposition overlay'}
          onPress={onToggleEdit}
        />
        <IconBtn
          icon="swap-horizontal-outline"
          active={flipped}
          themeColor={themeColor}
          accessibilityLabel="Flip overlay horizontally"
          onPress={handleFlip}
        />
      </View>
    </View>
  );
}

function SubSegment({
  icon,
  options,
  activeId,
  themeColor,
  onPick,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  options: { id: string; label: string }[];
  activeId: string;
  themeColor: string;
  onPick: (id: string) => void;
}) {
  return (
    <View style={styles.subSegment}>
      <Ionicons name={icon} size={13} color={CameraChrome.fgMuted} style={styles.subSegmentIcon} />
      {options.map((o) => {
        const active = o.id === activeId;
        const fg = active ? readableTextOn(themeColor) : CameraChrome.fg;
        return (
          <Pressable
            key={o.id}
            onPress={() => {
              if (o.id === activeId) return;
              hapticsBridge.selection();
              onPick(o.id);
            }}
            accessibilityRole="button"
            accessibilityLabel={o.label}
            accessibilityState={{ selected: active }}
            style={({ pressed }) => [
              styles.subSegmentBtn,
              active && { backgroundColor: themeColor },
              pressed && !active && styles.pillPressed,
            ]}>
            <ThemedText variant="captionSmall" weight="700" numberOfLines={1} style={{ color: fg }}>
              {o.label}
            </ThemedText>
          </Pressable>
        );
      })}
    </View>
  );
}

function IconBtn({
  icon,
  active,
  themeColor,
  accessibilityLabel,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  active: boolean;
  themeColor: string;
  accessibilityLabel: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ selected: active }}
      style={({ pressed }) => [
        styles.iconBtn,
        active ? { backgroundColor: themeColor, borderColor: themeColor } : null,
        pressed && { opacity: 0.7 },
      ]}>
      <Ionicons name={icon} size={17} color={active ? readableTextOn(themeColor) : '#fff'} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { gap: 8 },

  // Filter strip
  stripScroll: { flexGrow: 0 },
  stripContent: {
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 2,
    paddingVertical: 2,
  },
  modePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    height: 34,
    paddingHorizontal: 13,
    borderRadius: 17,
    backgroundColor: CameraChrome.controlFill,
    borderWidth: 1,
    borderColor: CameraChrome.border,
    ...cameraControlShadow,
  },
  pillPressed: { backgroundColor: 'rgba(255,255,255,0.12)' },

  // Sub-row (edge intensity / subject focus)
  subRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  subSegment: {
    flexDirection: 'row',
    alignItems: 'center',
    height: CameraChrome.subControlHeight,
    paddingLeft: 10,
    paddingRight: 4,
    gap: 3,
    flexShrink: 1,
    borderRadius: CameraChrome.pillRadius,
    backgroundColor: CameraChrome.controlFill,
    borderWidth: 1,
    borderColor: CameraChrome.border,
    ...cameraControlShadow,
  },
  subSegmentIcon: { marginRight: 3 },
  subSegmentBtn: {
    minWidth: 46,
    height: 26,
    paddingHorizontal: 10,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  combinePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    height: CameraChrome.subControlHeight,
    paddingHorizontal: 12,
    borderRadius: CameraChrome.pillRadius,
    backgroundColor: CameraChrome.controlFill,
    borderWidth: 1,
    borderColor: CameraChrome.border,
    ...cameraControlShadow,
  },
  characterPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    minHeight: 36,
    paddingHorizontal: 12,
    borderRadius: CameraChrome.pillRadius,
    backgroundColor: CameraChrome.controlFill,
    borderWidth: 1,
    borderColor: CameraChrome.border,
    ...cameraControlShadow,
  },

  // Opacity row
  opacityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dimmed: { opacity: 0.4 },
  opacityPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 44,
    paddingHorizontal: 12,
    borderRadius: CameraChrome.pillRadius,
    backgroundColor: CameraChrome.groupFill,
    borderWidth: 1,
    borderColor: CameraChrome.border,
    ...cameraControlShadow,
  },
  opacityLabel: { color: CameraChrome.fgMuted, width: 46 },
  slider: { flex: 1, height: 36 },
  opacityValue: { color: '#fff', width: 34, textAlign: 'right' },
  iconBtn: {
    width: 44,
    height: 44,
    borderRadius: CameraChrome.pillRadius,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: CameraChrome.controlFill,
    borderWidth: 1,
    borderColor: CameraChrome.border,
    ...cameraControlShadow,
  },
});
