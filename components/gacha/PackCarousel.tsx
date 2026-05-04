import { View, Text, Pressable, ActivityIndicator, Platform, StyleSheet } from 'react-native';
import FontAwesome5 from '@expo/vector-icons/FontAwesome5';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { LinearGradient } from 'expo-linear-gradient';

interface PackCarouselProps {
  onPull: () => void;
  canAfford: boolean;
  isPulling: boolean;
  pullCost: number;
  cardsPerPull: number;
}

export function PackCarousel({
  onPull,
  canAfford,
  isPulling,
  pullCost,
  cardsPerPull,
}: PackCarouselProps) {
  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <LinearGradient
          colors={['rgba(255,255,255,0.05)', 'transparent']}
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.content}>
          <View style={styles.iconContainer}>
            <FontAwesome5 name="box-open" size={56} color="#fff" style={{ opacity: 0.9 }} />
          </View>
          <Text style={styles.title}>Standard Signal</Text>
          <Text style={styles.subtitle}>
            CONTAINS <Text style={styles.subtitleHighlight}>{cardsPerPull}</Text> SIGNALS
          </Text>

          <Pressable
            onPress={onPull}
            disabled={!canAfford || isPulling}
            style={[styles.pullButton, !canAfford && styles.pullButtonDisabled]}>
            {isPulling ? (
              <ActivityIndicator color="#000" size="large" />
            ) : (
              <View style={styles.pullButtonContent}>
                <Text style={styles.pullButtonText}>SCAN NOW</Text>
                <View style={styles.pullButtonDot} />
                <Text style={styles.pullButtonCost}>{pullCost} COINS</Text>
              </View>
            )}
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
  },
  card: {
    width: 340,
    height: 520,
    borderRadius: 32,
    overflow: 'hidden',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    ...Platform.select({
      android: {
        backgroundColor: '#1E1E1E',
        elevation: 8,
      },
    }),
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  iconContainer: {
    width: 128,
    height: 128,
    borderRadius: 40,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 32,
    ...Platform.select({
      android: {
        elevation: 4,
      },
    }),
  },
  title: {
    color: 'rgba(255, 255, 255, 0.87)',
    fontSize: 28,
    fontWeight: '700',
    marginBottom: 12,
    textAlign: 'center',
    letterSpacing: -0.5,
    fontFamily: Platform.select({
      ios: 'System',
      android: 'Roboto',
    }),
  },
  subtitle: {
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: 16,
    fontWeight: '500',
    marginBottom: 40,
    textAlign: 'center',
    letterSpacing: 1,
    fontFamily: Platform.select({
      ios: 'System',
      android: 'Roboto',
    }),
  },
  subtitleHighlight: {
    color: 'rgba(255, 255, 255, 0.87)',
    fontWeight: '700',
  },
  pullButton: {
    width: '100%',
    height: 64,
    borderRadius: 32,
    overflow: 'hidden',
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      android: {
        elevation: 4,
      },
    }),
  },
  pullButtonDisabled: {
    opacity: 0.5,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
  pullButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  pullButtonText: {
    color: '#000',
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 2,
    fontFamily: Platform.select({
      ios: 'System',
      android: 'Roboto',
    }),
  },
  pullButtonDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
  },
  pullButtonCost: {
    color: 'rgba(0, 0, 0, 0.6)',
    fontSize: 14,
    fontWeight: '700',
    fontFamily: Platform.select({
      ios: 'System',
      android: 'Roboto',
    }),
  },
});
