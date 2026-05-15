import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { ThemedText, readableTextOn } from '../../themed';
import { useTheme } from '../../../context/ThemeContext';
import { hapticsBridge } from '../../../modules/haptics/hapticsBridge';
import {
  LANDSCAPE_TOOL_MENU_PANEL_GAP,
  LANDSCAPE_TOOL_MENU_PANEL_WIDTH,
  LANDSCAPE_TOOL_MENU_TRIGGER_SIZE,
} from '../../../libs/services/pilgrimage/camera-ui';

interface CameraToolMenuProps {
  themeColor: string;
  children: ReactNode;
  /**
   * When true, render the trigger as a compact label pill ("More ⚙") instead
   * of a circular icon button. Used by the landscape edge-anchored bottom bar
   * so it sits inline with the other chips.
   */
  inlineLabel?: boolean;
  /**
   * Where the expanded panel anchors relative to the trigger.
   * - `center` (default): panel is horizontally centred over the trigger.
   * - `right`: panel's right edge aligns with the trigger's right edge — used
   *   when the trigger sits near the right of the screen so the panel
   *   expands leftward instead of clipping under the ShutterRow rail.
   */
  panelAlign?: 'center' | 'right';
}

// Panel sits above the trigger and is wider than it — offset left so the panel
// stays centred over the trigger button.
const PANEL_LEFT_OFFSET = -(
  (LANDSCAPE_TOOL_MENU_PANEL_WIDTH - LANDSCAPE_TOOL_MENU_TRIGGER_SIZE) /
  2
);

export default function CameraToolMenu({
  themeColor,
  children,
  inlineLabel = false,
  panelAlign = 'center',
}: CameraToolMenuProps) {
  const { theme } = useTheme();
  const [expanded, setExpanded] = useState(false);
  const fg = readableTextOn(themeColor);

  const toggleExpanded = () => {
    hapticsBridge.selection();
    setExpanded((value) => !value);
  };

  const panelAnchorStyle =
    panelAlign === 'right' ? styles.panelAnchorRight : styles.panelAnchorCenter;

  return (
    <View pointerEvents="box-none" style={styles.root}>
      {expanded ? (
        <View
          style={[
            styles.panel,
            panelAnchorStyle,
            {
              borderColor: theme.glassBorder,
              backgroundColor: 'rgba(0,0,0,0.62)',
            },
          ]}>
          {children}
        </View>
      ) : null}

      {inlineLabel ? (
        <Pressable
          onPress={toggleExpanded}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={expanded ? 'Close camera tools' : 'Open camera tools'}
          accessibilityState={{ expanded }}
          style={({ pressed }) => [
            styles.triggerPill,
            {
              backgroundColor: expanded ? themeColor : 'rgba(0,0,0,0.45)',
              borderColor: expanded ? themeColor : theme.glassBorder,
              opacity: pressed ? 0.72 : 1,
            },
          ]}>
          <Ionicons
            name={expanded ? 'close' : 'options-outline'}
            size={16}
            color={expanded ? fg : '#fff'}
          />
          <ThemedText
            variant="caption"
            weight="700"
            style={{ color: expanded ? fg : '#fff' }}>
            {expanded ? 'Close' : 'More'}
          </ThemedText>
        </Pressable>
      ) : (
        <Pressable
          onPress={toggleExpanded}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={expanded ? 'Close camera tools' : 'Open camera tools'}
          accessibilityState={{ expanded }}
          style={({ pressed }) => [
            styles.trigger,
            {
              backgroundColor: expanded ? themeColor : 'rgba(0,0,0,0.48)',
              borderColor: expanded ? themeColor : theme.glassBorder,
              opacity: pressed ? 0.72 : 1,
            },
          ]}>
          <Ionicons
            name={expanded ? 'close' : 'options-outline'}
            size={22}
            color={expanded ? fg : '#fff'}
          />
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    position: 'relative',
    minWidth: LANDSCAPE_TOOL_MENU_TRIGGER_SIZE,
    minHeight: LANDSCAPE_TOOL_MENU_TRIGGER_SIZE,
    alignItems: 'center',
    justifyContent: 'flex-end',
    overflow: 'visible',
    zIndex: 40,
  },
  trigger: {
    width: LANDSCAPE_TOOL_MENU_TRIGGER_SIZE,
    height: LANDSCAPE_TOOL_MENU_TRIGGER_SIZE,
    borderRadius: LANDSCAPE_TOOL_MENU_TRIGGER_SIZE / 2,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.28,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
    zIndex: 42,
  },
  triggerPill: {
    height: 44,
    minWidth: 88,
    paddingHorizontal: 14,
    borderRadius: 22,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    shadowColor: '#000',
    shadowOpacity: 0.24,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
    zIndex: 42,
  },
  panel: {
    position: 'absolute',
    bottom: LANDSCAPE_TOOL_MENU_TRIGGER_SIZE + LANDSCAPE_TOOL_MENU_PANEL_GAP,
    width: LANDSCAPE_TOOL_MENU_PANEL_WIDTH,
    padding: 12,
    borderRadius: 20,
    borderWidth: 1,
    gap: 10,
    overflow: 'visible',
    zIndex: 41,
  },
  panelAnchorCenter: {
    left: PANEL_LEFT_OFFSET,
  },
  panelAnchorRight: {
    right: 0,
  },
});
