import { Pressable, StyleSheet, View } from 'react-native';
import Slider from '@react-native-community/slider';
import Ionicons from '@expo/vector-icons/Ionicons';
import { readableTextOn, ThemedText } from '../../../themed';
import { hapticsBridge } from '../../../../modules/haptics/hapticsBridge';
import {
  EDGE_INTENSITIES,
  edgeIntensityLabel,
  type EdgeIntensity,
} from '../../../../libs/services/pilgrimage/edge-overlay';
import {
  SUBJECT_FOCI,
  subjectFocusLabel,
  type SubjectFocus,
} from '../../../../libs/services/pilgrimage/subject-overlay';
import type { OverlayMode } from '../types';

interface OverlayControlsProps {
  mode: OverlayMode;
  edgeIntensity: EdgeIntensity;
  subjectFocus: SubjectFocus;
  subjectCombine: boolean;
  opacity: number;
  flipped: boolean;
  /** Whether the overlay is in free-drag reposition mode. */
  editMode: boolean;
  themeColor: string;
  onSelectMode: (mode: OverlayMode) => void;
  onSelectEdgeIntensity: (intensity: EdgeIntensity) => void;
  onSelectSubjectFocus: (focus: SubjectFocus) => void;
  onToggleSubjectCombine: () => void;
  onChangeOpacity: (opacity: number) => void;
  onToggleFlip: () => void;
  /** Toggles reposition mode. The parent closes this popover so the drag surface is clear. */
  onToggleEdit: () => void;
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
  { id: 'subject', icon: 'person-outline', label: 'Subject' },
];

/**
 * Overlay tool controls — mode pills, opacity slider, flip toggle. Renders as
 * a flat block in normal flow (no chip, no absolute pop-out); it is mounted
 * inside the OverlayDock slide-up panel, so it just fills the panel width.
 */
export default function OverlayControls({
  mode,
  edgeIntensity,
  subjectFocus,
  subjectCombine,
  opacity,
  flipped,
  editMode,
  themeColor,
  onSelectMode,
  onSelectEdgeIntensity,
  onSelectSubjectFocus,
  onToggleSubjectCombine,
  onChangeOpacity,
  onToggleFlip,
  onToggleEdit,
}: OverlayControlsProps) {
  const handleSelectMode = (next: OverlayMode) => {
    if (next === mode) return;
    hapticsBridge.selection();
    onSelectMode(next);
  };

  const handleSelectEdgeIntensity = (next: EdgeIntensity) => {
    if (next === edgeIntensity) return;
    hapticsBridge.selection();
    onSelectEdgeIntensity(next);
  };

  const handleSelectSubjectFocus = (next: SubjectFocus) => {
    if (next === subjectFocus) return;
    hapticsBridge.selection();
    onSelectSubjectFocus(next);
  };

  const handleFlip = () => {
    hapticsBridge.tap();
    onToggleFlip();
  };

  const handleToggleSubjectCombine = () => {
    hapticsBridge.selection();
    onToggleSubjectCombine();
  };

  return (
    <View style={styles.root}>
      <View style={styles.modeRow}>
        {MODES.map((m) => {
          const active = m.id === mode;
          const fg = active ? readableTextOn(themeColor) : '#fff';
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
              <Ionicons name={m.icon} size={14} color={fg} />
              <ThemedText
                variant="captionSmall"
                weight="600"
                numberOfLines={1}
                style={{ color: fg }}>
                {m.label}
              </ThemedText>
            </Pressable>
          );
        })}
      </View>

      {mode === 'edge' ? (
        <View style={styles.edgeIntensityRow}>
          {EDGE_INTENSITIES.map((intensity) => {
            const active = intensity === edgeIntensity;
            const fg = active ? readableTextOn(themeColor) : '#fff';
            return (
              <Pressable
                key={intensity}
                onPress={() => handleSelectEdgeIntensity(intensity)}
                accessibilityRole="button"
                accessibilityLabel={`Edge intensity ${edgeIntensityLabel(intensity)}`}
                accessibilityState={{ selected: active }}
                style={({ pressed }) => [
                  styles.edgeIntensityBtn,
                  active && { backgroundColor: themeColor, borderColor: themeColor },
                  pressed && { opacity: 0.75 },
                ]}>
                <ThemedText
                  variant="captionSmall"
                  weight="700"
                  numberOfLines={1}
                  style={{ color: fg }}>
                  {edgeIntensityLabel(intensity)}
                </ThemedText>
              </Pressable>
            );
          })}
        </View>
      ) : null}

      {mode === 'subject' ? (
        <View style={styles.subjectGroup}>
          <View style={styles.edgeIntensityRow}>
            {SUBJECT_FOCI.map((focus) => {
              const active = focus === subjectFocus;
              const fg = active ? readableTextOn(themeColor) : '#fff';
              return (
                <Pressable
                  key={focus}
                  onPress={() => handleSelectSubjectFocus(focus)}
                  accessibilityRole="button"
                  accessibilityLabel={`Subject focus ${subjectFocusLabel(focus)}`}
                  accessibilityState={{ selected: active }}
                  style={({ pressed }) => [
                    styles.edgeIntensityBtn,
                    active && { backgroundColor: themeColor, borderColor: themeColor },
                    pressed && { opacity: 0.75 },
                  ]}>
                  <ThemedText
                    variant="captionSmall"
                    weight="700"
                    numberOfLines={1}
                    style={{ color: fg }}>
                    {subjectFocusLabel(focus)}
                  </ThemedText>
                </Pressable>
              );
            })}
          </View>
          <Pressable
            onPress={handleToggleSubjectCombine}
            accessibilityRole="checkbox"
            accessibilityLabel="Combine subject overlay into captured photo"
            accessibilityState={{ checked: subjectCombine }}
            style={({ pressed }) => [
              styles.subjectCombineBtn,
              subjectCombine && { borderColor: themeColor },
              pressed && { opacity: 0.75 },
            ]}>
            <Ionicons
              name={subjectCombine ? 'checkbox' : 'square-outline'}
              size={18}
              color={subjectCombine ? themeColor : '#fff'}
            />
            <ThemedText variant="captionSmall" weight="700" style={styles.subjectCombineText}>
              Combine with photo
            </ThemedText>
          </Pressable>
        </View>
      ) : null}

      <View style={styles.sliderRow}>
        <ThemedText variant="captionSmall" weight="600" style={styles.sliderLabel}>
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

      <View style={styles.actionRow}>
        <Pressable
          onPress={onToggleEdit}
          accessibilityRole="button"
          accessibilityLabel={editMode ? 'Lock overlay position' : 'Reposition overlay'}
          accessibilityState={{ selected: editMode }}
          style={({ pressed }) => [
            styles.actionBtn,
            editMode && { backgroundColor: themeColor, borderColor: themeColor },
            pressed && { opacity: 0.75 },
          ]}>
          <Ionicons
            name={editMode ? 'lock-open' : 'move'}
            size={14}
            color={editMode ? readableTextOn(themeColor) : '#fff'}
          />
          <ThemedText
            variant="captionSmall"
            weight="600"
            style={{ color: editMode ? readableTextOn(themeColor) : '#fff' }}>
            {editMode ? 'Repositioning' : 'Reposition'}
          </ThemedText>
        </Pressable>

        <Pressable
          onPress={handleFlip}
          accessibilityRole="button"
          accessibilityLabel="Flip overlay horizontally"
          accessibilityState={{ selected: flipped }}
          style={({ pressed }) => [
            styles.actionBtn,
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
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: 10 },
  modeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  modePill: {
    flexGrow: 1,
    // Four modes across one row in the wide overlay panel; wraps on a narrow
    // panel rather than overflowing.
    flexBasis: '22%',
    minWidth: 74,
    minHeight: 40,
    borderRadius: 12,
    paddingHorizontal: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
  },
  sliderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 44,
  },
  sliderLabel: { color: '#fff', width: 40 },
  slider: { flex: 1, height: 36 },
  edgeIntensityRow: {
    flexDirection: 'row',
    gap: 8,
  },
  subjectGroup: { gap: 8 },
  edgeIntensityBtn: {
    flex: 1,
    minHeight: 38,
    borderRadius: 10,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
  },
  subjectCombineBtn: {
    minHeight: 44,
    borderRadius: 10,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
  },
  subjectCombineText: { color: '#fff' },
  actionRow: { flexDirection: 'row', gap: 8 },
  actionBtn: {
    flex: 1,
    minHeight: 44,
    borderRadius: 12,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
  },
});
