// Container for the live camera surface. It owns the CameraView plus camera
// gestures and the exposure preview tint. Reference overlays and focus/level
// guides are sibling layers in the screen so their z-order stays explicit.
//
// Lifecycle plumbing is intentionally minimal here: this component just
// forwards the camera lifecycle props through to CameraView. The compose
// (e.g. wire `onCameraReady` to BOTH `useCameraLifecycle` and
// `useLensSwitcher.refreshAvailableLenses`) happens in the parent screen, so
// that ordering and dependencies stay visible at the call site instead of
// being buried inside this child component.
//
// The optional `showWarmup` overlay renders a translucent theme-aware veil
// with a spinner + label, used by the parent while waiting for the first
// `onCameraReady` after a (re-)mount.
import type { RefObject } from 'react';
import { ActivityIndicator, Platform, StyleSheet, View } from 'react-native';
import {
  CameraView,
  type AvailableLenses,
  type CameraMountError,
  type CameraRatio,
  type CameraType,
  type FlashMode,
  type FocusMode,
} from 'expo-camera';
import {
  Gesture,
  GestureDetector,
  type PinchGesture,
  type TapGesture,
} from 'react-native-gesture-handler';
import { useTheme } from '../../../context/ThemeContext';
import type { AndroidCameraExtensionMode } from '../../../libs/services/pilgrimage/native-camera';
import { ThemedText } from '../../themed';
import BrightnessPreview from './BrightnessPreview';

interface CameraStageProps {
  cameraRef: RefObject<CameraView | null>;
  facing: CameraType;
  zoom: number;
  androidZoomRatio?: number;
  androidCameraExtensionMode?: AndroidCameraExtensionMode;
  autofocus: FocusMode;
  flashMode: FlashMode;
  enableTorch: boolean;
  selectedLens: string | null;
  pictureSize?: string;
  ratio?: CameraRatio;
  responsiveOrientationWhenOrientationLocked?: boolean;
  active?: boolean;
  animateShutter?: boolean;
  mute?: boolean;
  mirror?: boolean;

  pinchGesture: PinchGesture;
  tapGesture: TapGesture;

  brightnessOverlayStyle: { backgroundColor: string; opacity: number };

  /**
   * Forwarded to `CameraView.onCameraReady`. The parent is expected to
   * compose this with other ready-time work (e.g. `lensSwitcher.refreshAvailableLenses`).
   */
  onCameraReady?: () => void;
  /**
   * Wrapper around `CameraView.onMountError`: we rewrap the bare `{ message }`
   * payload into `{ nativeEvent }` so the consumer matches the
   * `useCameraLifecycle` hook contract.
   */
  onMountError?: (e: { nativeEvent: { message: string } }) => void;
  onAvailableLensesChanged?: (e: AvailableLenses) => void;

  /** When true, paint a translucent overlay + spinner while CameraView warms up. */
  showWarmup?: boolean;
}

export default function CameraStage({
  cameraRef,
  facing,
  zoom,
  androidZoomRatio,
  androidCameraExtensionMode,
  autofocus,
  flashMode,
  enableTorch,
  selectedLens,
  pictureSize,
  ratio,
  responsiveOrientationWhenOrientationLocked,
  active = true,
  animateShutter,
  mute,
  mirror,
  pinchGesture,
  tapGesture,
  brightnessOverlayStyle,
  onCameraReady,
  onMountError,
  onAvailableLensesChanged,
  showWarmup,
}: CameraStageProps) {
  const { theme } = useTheme();
  const androidNativeProps =
    Platform.OS === 'android'
      ? ({
          zoomRatio: androidZoomRatio,
          cameraExtensionMode: androidCameraExtensionMode ?? 'none',
        } as Record<string, unknown>)
      : {};

  return (
    <View style={styles.root}>
      <GestureDetector gesture={Gesture.Simultaneous(pinchGesture, tapGesture)}>
        <View style={StyleSheet.absoluteFill}>
          <CameraView
            {...androidNativeProps}
            ref={cameraRef}
            style={StyleSheet.absoluteFill}
            facing={facing}
            zoom={zoom}
            autofocus={autofocus}
            flash={flashMode}
            enableTorch={enableTorch}
            // CameraView's selectedLens prop is `string | undefined` — never pass null.
            selectedLens={selectedLens ?? undefined}
            pictureSize={pictureSize}
            ratio={ratio}
            responsiveOrientationWhenOrientationLocked={responsiveOrientationWhenOrientationLocked}
            active={active}
            animateShutter={animateShutter}
            mute={mute}
            mirror={mirror}
            onCameraReady={onCameraReady}
            onMountError={(event: CameraMountError) =>
              onMountError?.({ nativeEvent: { message: event.message } })
            }
            onAvailableLensesChanged={onAvailableLensesChanged}
          />
          <BrightnessPreview overlayStyle={brightnessOverlayStyle} />
          {showWarmup ? (
            <View
              pointerEvents="none"
              style={[
                StyleSheet.absoluteFill,
                styles.warmup,
                { backgroundColor: theme.background.primary, opacity: 0.5 },
              ]}>
              <View style={styles.warmupInner}>
                <ActivityIndicator color={theme.accent} />
                <ThemedText variant="bodyMedium" tone="secondary" style={styles.warmupLabel}>
                  Preparing camera…
                </ThemedText>
              </View>
            </View>
          ) : null}
        </View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  warmup: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  warmupInner: {
    alignItems: 'center',
    gap: 8,
  },
  warmupLabel: {
    textAlign: 'center',
  },
});
