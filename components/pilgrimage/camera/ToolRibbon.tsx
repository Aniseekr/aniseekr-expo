import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

interface ToolRibbonProps {
  isLandscape: boolean;
  /** Reserved for future top-anchored placement variants — keep in API for caller compatibility. */
  topInset: number;
  /** Reserved for future top-anchored placement variants — keep in API for caller compatibility. */
  bottomInset: number;
  /** Optional new slots — render before the existing chips when provided. */
  captureMode?: ReactNode;
  countdown?: ReactNode;
  settings?: ReactNode;
  overlay: ReactNode;
  flash: ReactNode;
  exposure: ReactNode;
  aspect: ReactNode;
}

// Pure layout container — owns no state and no animation. Each chip carries its
// own translucent rgba pill background so the ribbon itself stays invisible
// between chips (the "floating DSLR" feel). `pointerEvents="box-none"` means
// finger-downs that land in the gaps between chips fall through to the camera
// preview underneath instead of being eaten by an invisible wrapper.
export function ToolRibbon({
  isLandscape,
  topInset: _topInset,
  bottomInset: _bottomInset,
  captureMode,
  countdown,
  settings,
  overlay,
  flash,
  exposure,
  aspect,
}: ToolRibbonProps) {
  return (
    <View
      pointerEvents="box-none"
      style={[styles.root, isLandscape ? styles.column : styles.row]}>
      {captureMode}
      {countdown}
      {settings}
      {overlay}
      {flash}
      {exposure}
      {aspect}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    alignItems: 'center',
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 12,
  },
  column: {
    flexDirection: 'column',
    gap: 8,
    paddingVertical: 12,
  },
});
