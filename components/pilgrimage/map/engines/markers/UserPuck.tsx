// User-location puck for the MapLibre engine — the native equivalent of the
// Leaflet `.user-pulse` dot + `.user-heading` cone. Google-blue dot + white ring;
// the directional cone shows only in compass mode (heading != null) and rotates
// with the device heading the engine pushes via `setHeading`.
import { memo } from 'react';
import { StyleSheet, View } from 'react-native';

const USER_BLUE = '#4285F4';
const CHROME = '#FFFFFF';

export interface UserPuckProps {
  /** Device heading in degrees, or null to hide the cone (follow, not compass). */
  heading?: number | null;
}

function UserPuckImpl({ heading }: UserPuckProps) {
  return (
    <View style={styles.box}>
      {heading != null ? (
        <View
          accessibilityLabel="heading-cone"
          style={[styles.cone, { transform: [{ rotate: `${heading}deg` }] }]}>
          <View style={styles.coneTriangle} />
        </View>
      ) : null}
      <View style={styles.ring}>
        <View style={styles.dot} />
      </View>
    </View>
  );
}

export const UserPuck = memo(UserPuckImpl);

const styles = StyleSheet.create({
  box: { width: 80, height: 80, alignItems: 'center', justifyContent: 'center' },
  ring: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: CHROME,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: { width: 12, height: 12, borderRadius: 6, backgroundColor: USER_BLUE },
  // Cone fans upward from the dot; rotated by heading. Approximates the Leaflet
  // conic fan with a directional translucent triangle.
  cone: { position: 'absolute', alignItems: 'center', justifyContent: 'flex-start' },
  coneTriangle: {
    width: 0,
    height: 0,
    borderLeftWidth: 16,
    borderRightWidth: 16,
    borderBottomWidth: 34,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: USER_BLUE,
    opacity: 0.35,
    marginBottom: 6,
  },
});
