// Cluster bubble view for the MapLibre engine — the native equivalent of the
// Leaflet `.ms-dot` / `.ms-cluster` icons. Dot vs numbered + sizing + label come
// from the unit-tested cluster-style helpers; colour is the cluster's dominant
// region colour (computed by the engine via supercluster's reduce).
import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import {
  clusterBubbleSize,
  clusterDotSize,
  formatClusterCount,
  isDotCluster,
} from '../../../../../libs/services/pilgrimage/map-engine/cluster-style';

const CHROME = '#FFFFFF';

export interface ClusterBubbleProps {
  count: number;
  color: string;
  zoom: number;
  onPress?: () => void;
}

function ClusterBubbleImpl({ count, color, zoom, onPress }: ClusterBubbleProps) {
  const dot = isDotCluster(zoom, count);
  const size = dot ? clusterDotSize(count) : clusterBubbleSize(count);
  return (
    <Pressable accessibilityRole="button" onPress={onPress}>
      <View
        style={[
          styles.bubble,
          { width: size, height: size, borderRadius: size / 2, backgroundColor: color },
        ]}>
        {dot ? null : (
          <Text style={styles.count} numberOfLines={1}>
            {formatClusterCount(count)}
          </Text>
        )}
      </View>
    </Pressable>
  );
}

export const ClusterBubble = memo(ClusterBubbleImpl);

const styles = StyleSheet.create({
  bubble: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: CHROME,
  },
  count: { color: CHROME, fontSize: 12, fontWeight: '700' },
});
