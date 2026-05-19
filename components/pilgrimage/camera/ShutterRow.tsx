import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { hapticsBridge } from '../../../modules/haptics/hapticsBridge';
import { readableTextOn } from '../../themed';
import { CAMERA_LANDSCAPE_CLUSTER_RESERVE } from '../../../libs/services/pilgrimage/camera-ui';
import { CameraChrome, cameraControlShadow } from './cameraChrome';
import BurstIndicator from './BurstIndicator';

/**
 * Horizontal space the landscape control cluster reserves on the right edge.
 * The screen uses this to keep HUD layers clear of the floating shutter cluster.
 */
export const SHUTTER_ROW_LANDSCAPE_WIDTH = CAMERA_LANDSCAPE_CLUSTER_RESERVE;

interface ShutterRowProps {
  themeColor: string;
  capturing: boolean;
  isLandscape: boolean;
  /** Front camera active — flips the flip button into its toggled state. */
  isFrontFacing: boolean;
  onShutter: () => void;
  onPickLibrary: () => void;
  onFlip: () => void;
  /** Optional long-press handler — triggers burst capture in the parent. */
  onLongPress?: () => void;
  /** When `active`, overlay a progress ring on top of the shutter button. */
  burst?: { active: boolean; captured: number; total: number };
}

const SHUTTER_SIZE = 72;
const SHUTTER_SIZE_LANDSCAPE = 60;
const SHUTTER_GAP = 14;

/**
 * The capture controls — library, shutter, flip. Renders just the cluster (a
 * row in portrait, a column in landscape); the screen owns where it sits.
 *
 * There is no solid bar — the buttons float translucent over the live preview.
 * rgba / #fff chrome is allowed here (CLAUDE.md camera-scrim exception).
 */
export default function ShutterRow({
  themeColor,
  capturing,
  isLandscape,
  isFrontFacing,
  onShutter,
  onPickLibrary,
  onFlip,
  onLongPress,
  burst,
}: ShutterRowProps) {
  const burstActive = burst?.active === true;
  const shutterDisabled = capturing || burstActive;
  const shutterSize = isLandscape ? SHUTTER_SIZE_LANDSCAPE : SHUTTER_SIZE;
  const coreSize = shutterSize - SHUTTER_GAP;

  const handleShutterPress = () => {
    if (shutterDisabled) return;
    hapticsBridge.success();
    onShutter();
  };

  const handleShutterLongPress = onLongPress
    ? () => {
        if (shutterDisabled) return;
        hapticsBridge.longPress();
        onLongPress();
      }
    : undefined;

  const handleLibraryPress = () => {
    hapticsBridge.tap();
    onPickLibrary();
  };

  const handleFlipPress = () => {
    hapticsBridge.selection();
    onFlip();
  };

  const shutter = (
    <Pressable
      onPress={handleShutterPress}
      onLongPress={handleShutterLongPress}
      delayLongPress={handleShutterLongPress ? 250 : undefined}
      disabled={shutterDisabled}
      accessibilityRole="button"
      accessibilityLabel="Take comparison photo"
      style={({ pressed }) => [
        styles.shutterRing,
        { width: shutterSize, height: shutterSize, borderRadius: shutterSize / 2 },
        pressed && !shutterDisabled && styles.shutterPressed,
        shutterDisabled && { opacity: 0.6 },
      ]}>
      {capturing && !burstActive ? (
        <ActivityIndicator size="small" color="#fff" />
      ) : (
        <View
          style={[
            styles.shutterCore,
            { width: coreSize, height: coreSize, borderRadius: coreSize / 2 },
          ]}
        />
      )}
      {burstActive && burst ? (
        <BurstIndicator captured={burst.captured} total={burst.total} themeColor={themeColor} />
      ) : null}
    </Pressable>
  );

  const library = (
    <SideButton
      shape="square"
      accessibilityLabel="Pick photo from library"
      onPress={handleLibraryPress}>
      <Ionicons name="images-outline" size={20} color="#fff" />
    </SideButton>
  );

  const flip = (
    <SideButton
      shape="circle"
      accessibilityLabel={isFrontFacing ? 'Use back camera' : 'Use front camera'}
      accessibilityState={{ selected: isFrontFacing }}
      active={isFrontFacing}
      themeColor={themeColor}
      onPress={handleFlipPress}>
      <Ionicons
        name="camera-reverse-outline"
        size={20}
        color={isFrontFacing ? readableTextOn(themeColor) : '#fff'}
      />
    </SideButton>
  );

  return (
    <View style={isLandscape ? styles.clusterColumn : styles.clusterRow}>
      {library}
      {shutter}
      {flip}
    </View>
  );
}

function SideButton({
  children,
  onPress,
  accessibilityLabel,
  accessibilityState,
  shape,
  active = false,
  themeColor,
}: {
  children: ReactNode;
  onPress: () => void;
  accessibilityLabel: string;
  accessibilityState?: { selected?: boolean };
  shape: 'square' | 'circle';
  active?: boolean;
  themeColor?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={accessibilityState}
      style={({ pressed }) => [
        styles.sideBtn,
        shape === 'circle' ? styles.sideBtnCircle : styles.sideBtnSquare,
        active && themeColor ? { backgroundColor: themeColor, borderColor: themeColor } : null,
        pressed && { opacity: 0.7 },
      ]}>
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // All rgba / #fff below sit over the live camera preview — camera-scrim
  // exception (CLAUDE.md). There is no solid bar; just the floating controls.
  clusterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 36,
  },
  clusterColumn: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 20,
  },
  // Shutter — a white ring with a white core, the universal capture affordance.
  shutterRing: {
    borderWidth: 3,
    borderColor: '#fff',
    backgroundColor: 'rgba(0,0,0,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    ...cameraControlShadow,
  },
  shutterPressed: { backgroundColor: 'rgba(0,0,0,0.38)' },
  shutterCore: { backgroundColor: '#fff' },
  sideBtn: {
    width: CameraChrome.circleSize,
    height: CameraChrome.circleSize,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: CameraChrome.border,
    backgroundColor: CameraChrome.controlFill,
    ...cameraControlShadow,
  },
  sideBtnCircle: { borderRadius: CameraChrome.circleSize / 2 },
  sideBtnSquare: { borderRadius: 14 },
});
