import { Pressable, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import Ionicons from '@expo/vector-icons/Ionicons';
import { ThemedText, readableTextOn } from '../../themed';
import { hapticsBridge } from '../../../modules/haptics/hapticsBridge';

interface ReferenceThumbnailProps {
  /** The anime reference image the user is framing against. */
  imageUrl: string;
  themeColor: string;
  isLandscape: boolean;
  /** Opens the scene switcher so the user can compare against a different spot. */
  onPress: () => void;
}

// Reference scenes are 16:9 frames — keep the thumbnail in that ratio so the
// preview isn't cropped oddly. Landscape gets a roomier thumbnail.
const SIZE = {
  portrait: { width: 96, height: 60 },
  landscape: { width: 132, height: 80 },
} as const;

/**
 * The floating anime-reference thumbnail pinned to the top-left of the camera.
 * It shows which scene the user is matching; tapping it opens the scene
 * switcher to pick a different spot. rgba / #000 chrome is allowed here — the
 * thumbnail floats over the live camera preview, not a theme surface.
 */
export default function ReferenceThumbnail({
  imageUrl,
  themeColor,
  isLandscape,
  onPress,
}: ReferenceThumbnailProps) {
  const size = isLandscape ? SIZE.landscape : SIZE.portrait;

  const handlePress = () => {
    hapticsBridge.tap();
    onPress();
  };

  return (
    <Pressable
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityLabel="Switch anime reference scene"
      style={({ pressed }) => [
        styles.root,
        { width: size.width, height: size.height },
        pressed && { opacity: 0.82 },
      ]}>
      {imageUrl ? (
        <Image
          source={{ uri: imageUrl }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          transition={140}
        />
      ) : (
        <View style={[StyleSheet.absoluteFill, styles.placeholder]}>
          <Ionicons name="image-outline" size={18} color="rgba(255,255,255,0.5)" />
        </View>
      )}

      <View style={[styles.badge, { backgroundColor: themeColor }]}>
        <ThemedText
          variant="captionSmall"
          weight="800"
          style={{ color: readableTextOn(themeColor), letterSpacing: 1 }}>
          REF
        </ThemedText>
      </View>

      <View style={styles.switchHint}>
        <Ionicons name="swap-horizontal" size={13} color="#fff" />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.32)',
    backgroundColor: 'rgba(0,0,0,0.4)',
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 6,
  },
  placeholder: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  badge: {
    position: 'absolute',
    top: 5,
    left: 5,
    paddingHorizontal: 6,
    height: 17,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Bottom-right corner affordance — signals the thumbnail is tappable to
  // browse other scenes (the mockup's expand-style corner glyph).
  switchHint: {
    position: 'absolute',
    right: 5,
    bottom: 5,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.25)',
  },
});
