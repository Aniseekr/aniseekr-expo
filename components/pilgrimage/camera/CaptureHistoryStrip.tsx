// Horizontal (portrait) / vertical (landscape) thumbnail strip showing the
// session's recent captures. Sits next to the shutter rail so the user can
// re-open a frame without leaving the camera screen.
//
// Rule 8: renders ONLY the URIs the parent passes via `uris`. If the parent
// has nothing yet (capture not run), `uris.length === 0` and we render
// nothing — no placeholder squares, no skeletons. Empty state is honest.

import { Pressable, ScrollView, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { useTheme } from '../../../context/ThemeContext';
import { hapticsBridge } from '../../../modules/haptics/hapticsBridge';

interface CaptureHistoryStripProps {
  /** Most-recent-first list of captured photo URIs (cap maintained by parent hook). */
  uris: string[];
  /** Tap handler — parent typically routes to a preview screen with the picked URI. */
  onSelect: (uri: string) => void;
  /** Active theme accent — used for the active border ring. */
  themeColor: string;
  /** Layout direction: vertical column when the camera is in landscape, horizontal row otherwise. */
  isLandscape: boolean;
}

const THUMB_SIZE = 48;

export default function CaptureHistoryStrip({
  uris,
  onSelect,
  themeColor,
  isLandscape,
}: CaptureHistoryStripProps) {
  const { theme } = useTheme();

  // Honest empty state — parent owns the data, we mirror it. See header note.
  if (uris.length === 0) return null;

  return (
    <ScrollView
      horizontal={!isLandscape}
      showsHorizontalScrollIndicator={false}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={isLandscape ? styles.contentColumn : styles.contentRow}
      style={[
        isLandscape ? styles.containerColumn : styles.containerRow,
        {
          backgroundColor: 'rgba(0,0,0,0.35)',
          borderColor: theme.glassBorder,
        },
      ]}>
      {uris.map((uri) => (
        <Pressable
          key={uri}
          onPress={() => {
            hapticsBridge.tap();
            onSelect(uri);
          }}
          accessibilityRole="button"
          accessibilityLabel="Open recent capture"
          style={({ pressed }) => [
            styles.thumb,
            {
              borderColor: themeColor,
              opacity: pressed ? 0.7 : 1,
            },
          ]}>
          <Image source={{ uri }} style={styles.thumbImage} contentFit="cover" transition={120} />
        </Pressable>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  // Translucent black scrim mirrors FocalPills/ShutterRow — sits over the live
  // preview, not a theme surface. Allowed per CLAUDE.md (rgba on camera scrims).
  containerRow: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    paddingVertical: 4,
  },
  containerColumn: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    paddingHorizontal: 4,
  },
  contentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 6,
  },
  contentColumn: {
    flexDirection: 'column',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
  },
  thumb: {
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: 8,
    borderWidth: 2,
    overflow: 'hidden',
  },
  thumbImage: {
    width: '100%',
    height: '100%',
  },
});
