import { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

export default function Index() {
  const router = useRouter();
  const eyeScale = useRef(new Animated.Value(0.3)).current;
  const eyeOpacity = useRef(new Animated.Value(0)).current;
  const glowScale = useRef(new Animated.Value(0.8)).current;

  useEffect(() => {
    // Start animations
    Animated.parallel([
      Animated.spring(eyeScale, {
        toValue: 1.0,
        tension: 50,
        friction: 7,
        useNativeDriver: true,
      }),
      Animated.timing(eyeOpacity, {
        toValue: 1.0,
        duration: 600,
        useNativeDriver: true,
      }),
    ]).start();

    // Glow pulse animation
    Animated.loop(
      Animated.sequence([
        Animated.timing(glowScale, {
          toValue: 1.2,
          duration: 2000,
          useNativeDriver: true,
        }),
        Animated.timing(glowScale, {
          toValue: 0.8,
          duration: 2000,
          useNativeDriver: true,
        }),
      ])
    ).start();

    // Navigate after animation
    const timer = setTimeout(() => {
      router.replace('/(rate)');
    }, 2000);

    return () => clearTimeout(timer);
  }, [eyeScale, eyeOpacity, glowScale, router]);

  return (
    <View style={styles.container}>
      <LinearGradient colors={['#0D0514', '#191932', '#0D0514']} style={StyleSheet.absoluteFill} />

      {/* Background glow */}
      <Animated.View
        style={[
          styles.glow,
          {
            transform: [{ scale: glowScale }],
          },
        ]}
      />

      <View style={styles.content}>
        {/* Glow behind eye */}
        <Animated.View
          style={[
            styles.eyeGlow,
            {
              opacity: eyeOpacity,
              transform: [{ scale: eyeScale }],
            },
          ]}>
          <MaterialIcons name="remove-red-eye" size={120} color="#00FFE5" />
        </Animated.View>

        {/* Main eye icon */}
        <Animated.View
          style={[
            styles.eyeContainer,
            {
              opacity: eyeOpacity,
              transform: [{ scale: eyeScale }],
            },
          ]}>
          <MaterialIcons name="remove-red-eye" size={120} color="#fff" />
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  glow: {
    position: 'absolute',
    width: 300,
    height: 300,
    borderRadius: 150,
    backgroundColor: 'rgba(0, 255, 229, 0.05)',
    alignSelf: 'center',
    top: '40%',
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  eyeGlow: {
    position: 'absolute',
    opacity: 0.5,
  },
  eyeContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
