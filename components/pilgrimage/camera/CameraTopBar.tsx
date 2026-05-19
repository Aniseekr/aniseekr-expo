import { type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { ThemedText, readableTextOn } from '../../themed';
import { hapticsBridge } from '../../../modules/haptics/hapticsBridge';
import {
  CAMERA_TOP_BAR_CONTENT_HEIGHT,
  CAMERA_TOP_BAR_ROW2_HEIGHT,
} from '../../../libs/services/pilgrimage/camera-ui';
import { CameraChrome, cameraControlShadow } from './cameraChrome';

const TEXT_SHADOW = {
  textShadowColor: 'rgba(0,0,0,0.7)',
  textShadowOffset: { width: 0, height: 1 },
  textShadowRadius: 4,
} as const;

interface CameraTopBarProps {
  /** Spot name shown as small centered text. */
  placeName: string;
  themeColor: string;
  topInset: number;
  leftInset?: number;
  rightInset?: number;
  onClose: () => void;
  /** Up to 3 icon-button actions on the right side. */
  actions?: ReactNode;
  /** Optional second-row quick controls such as timer, aspect, and orientation. */
  quickControls?: ReactNode;
  quickControlsExpanded?: boolean;
  onToggleQuickControls?: () => void;
}

/**
 * Simplified camera top bar: close button (left), spot name (center, flat
 * text), and up to 3 icon buttons (right). No expandable row, no pill border.
 * Everything floats over the live camera preview.
 */
export default function CameraTopBar({
  placeName,
  themeColor,
  topInset,
  leftInset = 0,
  rightInset = 0,
  onClose,
  actions,
  quickControls,
  quickControlsExpanded = false,
  onToggleQuickControls,
}: CameraTopBarProps) {
  const hasQuickControls = quickControls != null && onToggleQuickControls != null;
  const showQuickControls = hasQuickControls && quickControlsExpanded;
  const scrimHeight =
    topInset + CAMERA_TOP_BAR_CONTENT_HEIGHT + (showQuickControls ? CAMERA_TOP_BAR_ROW2_HEIGHT : 0);
  const handleToggleQuickControls = () => {
    if (!onToggleQuickControls) return;
    hapticsBridge.selection();
    onToggleQuickControls();
  };

  return (
    <View
      style={[
        styles.bar,
        {
          paddingTop: topInset,
          paddingLeft: Math.max(12, leftInset),
          paddingRight: Math.max(12, rightInset),
        },
      ]}>
      <LinearGradient
        pointerEvents="none"
        colors={['rgba(0,0,0,0.58)', 'rgba(0,0,0,0)']}
        style={[styles.scrim, { height: scrimHeight + 16 }]}
      />

      <View style={styles.row}>
        <Pressable
          onPress={onClose}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Close camera"
          style={({ pressed }) => [styles.btn, pressed && { opacity: 0.6 }]}>
          <Ionicons name="close" size={20} color="#fff" />
        </Pressable>

        <View style={styles.nameSlot} pointerEvents="none">
          <ThemedText variant="captionSmall" weight="600" numberOfLines={1} style={styles.nameText}>
            {placeName}
          </ThemedText>
        </View>

        <View style={styles.actionsRow}>
          {actions}
          {hasQuickControls ? (
            <CameraHeaderButton
              icon={quickControlsExpanded ? 'chevron-up' : 'chevron-down'}
              accessibilityLabel={
                quickControlsExpanded
                  ? 'Collapse camera quick controls'
                  : 'Expand camera quick controls'
              }
              accessibilityState={{ expanded: quickControlsExpanded }}
              themeColor={themeColor}
              active={quickControlsExpanded}
              onPress={handleToggleQuickControls}
            />
          ) : null}
        </View>
      </View>

      {showQuickControls ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.quickRowScroll}
          contentContainerStyle={[
            styles.quickRowContent,
            {
              paddingLeft: Math.max(12, leftInset),
              paddingRight: Math.max(12, rightInset),
            },
          ]}>
          {quickControls}
        </ScrollView>
      ) : null}
    </View>
  );
}

interface CameraHeaderButtonProps {
  icon: keyof typeof Ionicons.glyphMap;
  accessibilityLabel: string;
  themeColor: string;
  onPress: () => void;
  active?: boolean;
  accessibilityState?: { selected?: boolean; expanded?: boolean };
}

/**
 * Flat translucent disc — fills with themeColor when toggled active.
 * All top-bar icon actions use this so sizing/chrome stays consistent.
 */
export function CameraHeaderButton({
  icon,
  accessibilityLabel,
  themeColor,
  onPress,
  active = false,
  accessibilityState,
}: CameraHeaderButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={accessibilityState}
      style={({ pressed }) => [
        styles.btn,
        active ? { backgroundColor: themeColor, borderColor: themeColor } : null,
        pressed && { opacity: 0.6 },
      ]}>
      <Ionicons name={icon} size={17} color={active ? readableTextOn(themeColor) : '#fff'} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 70,
  },
  scrim: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
  },
  row: {
    height: CAMERA_TOP_BAR_CONTENT_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  quickRowScroll: {
    flexGrow: 0,
    height: CAMERA_TOP_BAR_ROW2_HEIGHT,
  },
  quickRowContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingTop: 4,
    paddingBottom: 10,
  },
  // All rgba / #fff values float over the live camera preview.
  btn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: CameraChrome.controlFill,
    borderWidth: 1,
    borderColor: CameraChrome.border,
    ...cameraControlShadow,
  },
  nameSlot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nameText: {
    color: 'rgba(255,255,255,0.72)',
    ...TEXT_SHADOW,
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
});
