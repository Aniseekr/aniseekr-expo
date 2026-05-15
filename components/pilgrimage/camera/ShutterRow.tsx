import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import Ionicons from '@expo/vector-icons/Ionicons';
import { bottomPad } from '../../../constants/DesignSystem';
import { hapticsBridge } from '../../../modules/haptics/hapticsBridge';
import { ThemedText } from '../../themed';
import BurstIndicator from './BurstIndicator';

interface ShutterRowProps {
  themeColor: string;
  referenceImageUrl: string;
  capturing: boolean;
  isLandscape: boolean;
  bottomInset: number;
  /** Status-bar inset — only consumed in landscape so the column avoids the notch. */
  topInset?: number;
  onShutter: () => void;
  onOpenMap: () => void;
  onPickReference: () => void;
  /** Optional long-press handler. Triggers burst capture in the parent. */
  onLongPress?: () => void;
  /** When `active`, overlay a progress ring on top of the shutter button. */
  burst?: { active: boolean; captured: number; total: number };
}

/** Fixed width of the landscape control column. Parent uses this to know how
 *  much horizontal space to reserve on the right edge of the camera preview. */
export const SHUTTER_ROW_LANDSCAPE_WIDTH = 100;

export default function ShutterRow({
  themeColor,
  referenceImageUrl,
  capturing,
  isLandscape,
  bottomInset,
  topInset = 0,
  onShutter,
  onOpenMap,
  onPickReference,
  onLongPress,
  burst,
}: ShutterRowProps) {
  const burstActive = burst?.active === true;
  const shutterDisabled = capturing || burstActive;
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

  const handleMapPress = () => {
    hapticsBridge.tap();
    onOpenMap();
  };

  const handleReferencePress = () => {
    hapticsBridge.tap();
    onPickReference();
  };

  if (isLandscape) {
    return (
      <View
        style={[
          styles.bottomBarLandscape,
          {
            width: SHUTTER_ROW_LANDSCAPE_WIDTH,
            paddingTop: topInset + 24,
            paddingBottom: bottomPad({ bottom: bottomInset }) + 24,
          },
        ]}>
        <LinearGradient
          // Horizontal scrim: transparent on the left edge of the column,
          // near-opaque on the right edge. The strong right side hides the
          // anime overlay so buttons in the column stay legible. Sits over the
          // live camera preview — no theme surface below.
          colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.92)']}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.columnContent}>
          <ThumbnailBtn
            kind="reference"
            themeColor={themeColor}
            imageUrl={referenceImageUrl}
            onPress={handleReferencePress}
          />

          <Pressable
            onPress={handleShutterPress}
            onLongPress={handleShutterLongPress}
            delayLongPress={handleShutterLongPress ? 250 : undefined}
            disabled={shutterDisabled}
            accessibilityRole="button"
            accessibilityLabel="Take comparison photo"
            style={({ pressed }) => [
              styles.shutterOuter,
              styles.shutterOuterLandscape,
              { borderColor: themeColor },
              pressed && { opacity: 0.85 },
              shutterDisabled && { opacity: 0.6 },
            ]}>
            {capturing && !burstActive ? (
              <ActivityIndicator size="small" color={themeColor} />
            ) : (
              <View
                style={[
                  styles.shutterInner,
                  styles.shutterInnerLandscape,
                  { backgroundColor: themeColor },
                ]}
              />
            )}
            {burstActive && burst ? (
              <BurstIndicator
                captured={burst.captured}
                total={burst.total}
                themeColor={themeColor}
              />
            ) : null}
          </Pressable>

          <ThumbnailBtn kind="map" themeColor={themeColor} onPress={handleMapPress} />
        </View>
      </View>
    );
  }

  return (
    <View
      style={[
        styles.bottomBar,
        { paddingBottom: bottomPad({ bottom: bottomInset }) + 4 },
      ]}>
      <LinearGradient
        // rgba scrim sits over the live camera preview — no theme surface below.
        // Strong bottom opacity so the anime overlay can't bleed through the
        // map/reference buttons that sit on the dark end.
        colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.92)']}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.bottomRow}>
        <ThumbnailBtn kind="map" themeColor={themeColor} onPress={handleMapPress} />

        <View style={styles.shutterColumn}>
          <Pressable
            onPress={handleShutterPress}
            onLongPress={handleShutterLongPress}
            delayLongPress={handleShutterLongPress ? 250 : undefined}
            disabled={shutterDisabled}
            accessibilityRole="button"
            accessibilityLabel="Take comparison photo"
            style={({ pressed }) => [
              styles.shutterOuter,
              { borderColor: themeColor },
              pressed && { opacity: 0.85 },
              shutterDisabled && { opacity: 0.6 },
            ]}>
            {capturing && !burstActive ? (
              <ActivityIndicator size="small" color={themeColor} />
            ) : (
              <View style={[styles.shutterInner, { backgroundColor: themeColor }]} />
            )}
            {burstActive && burst ? (
              <BurstIndicator
                captured={burst.captured}
                total={burst.total}
                themeColor={themeColor}
              />
            ) : null}
          </Pressable>
          <ThemedText
            variant="captionSmall"
            weight="700"
            align="center"
            style={{ color: 'rgba(255,255,255,0.6)', marginTop: 6, letterSpacing: 1 }}>
            PHOTO
          </ThemedText>
        </View>

        <ThumbnailBtn
          kind="reference"
          themeColor={themeColor}
          imageUrl={referenceImageUrl}
          onPress={handleReferencePress}
        />
      </View>
    </View>
  );
}

function ThumbnailBtn({
  kind,
  imageUrl,
  themeColor,
  onPress,
}: {
  kind: 'map' | 'reference';
  imageUrl?: string;
  themeColor: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={kind === 'map' ? 'Open map' : 'Show anime reference'}
      style={({ pressed }) => [
        styles.thumbBtn,
        {
          borderColor: kind === 'map' ? themeColor : 'rgba(255,255,255,0.28)',
          opacity: pressed ? 0.7 : 1,
        },
      ]}>
      {kind === 'reference' && imageUrl ? (
        <Image
          source={{ uri: imageUrl }}
          style={styles.thumbImage}
          contentFit="cover"
          transition={120}
        />
      ) : (
        <View style={[styles.thumbMap, { backgroundColor: 'rgba(0,0,0,0.92)' }]}>
          <Ionicons name="map" size={18} color={themeColor} />
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 18,
    paddingTop: 24,
  },
  // iOS Camera-style right-edge column. The container fills the full vertical
  // space so the LinearGradient scrim covers the entire right rail.
  bottomBarLandscape: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
  },
  // Distributes [reference thumb, shutter, map thumb] evenly down the column.
  columnContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
  },
  shutterColumn: {
    alignItems: 'center',
  },
  shutterOuter: {
    width: 78,
    height: 78,
    borderRadius: 39,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderWidth: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterOuterLandscape: {
    width: 66,
    height: 66,
    borderRadius: 33,
    borderWidth: 3,
  },
  shutterInner: {
    width: 56,
    height: 56,
    borderRadius: 28,
  },
  shutterInnerLandscape: {
    width: 46,
    height: 46,
    borderRadius: 23,
  },
  thumbBtn: {
    width: 56,
    height: 56,
    borderRadius: 12,
    borderWidth: 2,
    overflow: 'hidden',
  },
  thumbImage: {
    width: '100%',
    height: '100%',
  },
  thumbMap: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
