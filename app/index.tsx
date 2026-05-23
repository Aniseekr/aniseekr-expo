import { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated, Easing, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { AniseekrEye } from '../components/common/AniseekrEye';
import { isOnboardingCompleteSync } from '../libs/services/onboarding-service';

// Mirrors aniseeker/AniseekrSplashScreen.swift:
// - pulsating cyan glow ball behind the eye (.repeatForever, autoreverses)
// - two layered eye SVGs: blurred cyan halo behind + white mark on top
// - spring(response: 0.6, dampingFraction: 0.6) entry from scale 0.3→1, opacity 0→1
const PRIMARY_GLOW = '#00FFE6';
const EYE_SIZE = 160;

export default function Index() {
  const router = useRouter();

  // Eye entry
  const eyeScale = useRef(new Animated.Value(0.3)).current;
  const eyeOpacity = useRef(new Animated.Value(0)).current;

  // Background breathing glow ball
  const bgScale = useRef(new Animated.Value(0.9)).current;
  const bgOpacity = useRef(new Animated.Value(0.35)).current;

  // Halo pulse around the eye
  const haloPulse = useRef(new Animated.Value(1)).current;

  // Expanding scanner ring
  const ringScale = useRef(new Animated.Value(0.6)).current;
  const ringOpacity = useRef(new Animated.Value(0)).current;

  // Blink — vertical squash applied to every eye layer in sync.
  const blink = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    // Spring entrance — bouncy, matches SwiftUI spring(0.6, 0.6).
    Animated.parallel([
      Animated.spring(eyeScale, {
        toValue: 1,
        damping: 9,
        stiffness: 130,
        mass: 1,
        overshootClamping: false,
        useNativeDriver: true,
      }),
      Animated.timing(eyeOpacity, {
        toValue: 1,
        duration: 550,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();

    // Background glow ball breathing — repeatForever(autoreverses: true)
    Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(bgScale, {
            toValue: 1.2,
            duration: 1800,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(bgOpacity, {
            toValue: 0.6,
            duration: 1800,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ]),
        Animated.parallel([
          Animated.timing(bgScale, {
            toValue: 0.9,
            duration: 1800,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(bgOpacity, {
            toValue: 0.3,
            duration: 1800,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ]),
      ]),
    ).start();

    // Halo pulse: the cyan eye underlay throbs subtly to imitate the SwiftUI blur glow.
    Animated.loop(
      Animated.sequence([
        Animated.timing(haloPulse, {
          toValue: 1.08,
          duration: 1400,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(haloPulse, {
          toValue: 1,
          duration: 1400,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    ).start();

    // Scanner ring — expands then fades, on loop.
    Animated.loop(
      Animated.parallel([
        Animated.sequence([
          Animated.timing(ringScale, {
            toValue: 0.6,
            duration: 0,
            useNativeDriver: true,
          }),
          Animated.timing(ringScale, {
            toValue: 1.7,
            duration: 2200,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
        ]),
        Animated.sequence([
          Animated.timing(ringOpacity, {
            toValue: 0.55,
            duration: 400,
            useNativeDriver: true,
          }),
          Animated.timing(ringOpacity, {
            toValue: 0,
            duration: 1800,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
        ]),
      ]),
    ).start();

    // Blink loop — starts after the spring entry settles, then repeats with a
    // 1.6s pause so the eye feels alive without being twitchy.
    Animated.loop(
      Animated.sequence([
        Animated.delay(900),
        Animated.timing(blink, {
          toValue: 0.06,
          duration: 110,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(blink, {
          toValue: 1,
          duration: 180,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.delay(1600),
      ]),
    ).start();

    const timer = setTimeout(() => {
      router.replace(isOnboardingCompleteSync() ? '/(rate)' : '/onboarding');
    }, 2600);

    return () => clearTimeout(timer);
  }, [
    eyeScale,
    eyeOpacity,
    bgScale,
    bgOpacity,
    haloPulse,
    ringScale,
    ringOpacity,
    blink,
    router,
  ]);

  const haloScale = Animated.multiply(eyeScale, haloPulse);
  const haloOuterScale = Animated.multiply(eyeScale, Animated.add(haloPulse, 0.1));
  const haloOpacity = Animated.multiply(eyeOpacity, 0.55);
  const haloOuterOpacity = Animated.multiply(eyeOpacity, 0.22);

  return (
    <View style={styles.container}>
      <LinearGradient colors={['#0D0514', '#191932', '#0D0514']} style={StyleSheet.absoluteFill} />

      {/* Pulsating background glow ball — matches the iOS blur(50) circle */}
      <Animated.View
        pointerEvents="none"
        style={[
          styles.bgGlow,
          {
            opacity: bgOpacity,
            transform: [{ scale: bgScale }],
          },
        ]}
      />

      <View style={styles.content}>
        {/* Expanding scanner ring (subtle extra polish, sits behind the eye) */}
        <Animated.View
          pointerEvents="none"
          style={[
            styles.ring,
            {
              opacity: ringOpacity,
              transform: [{ scale: ringScale }],
            },
          ]}
        />

        {/* Outer cyan halo — biggest, faintest copy of the eye */}
        <Animated.View
          pointerEvents="none"
          style={[
            styles.eyeLayer,
            styles.haloOuter,
            {
              opacity: haloOuterOpacity,
              transform: [{ scale: haloOuterScale }, { scaleY: blink }],
            },
          ]}>
          <AniseekrEye size={EYE_SIZE} color={PRIMARY_GLOW} strokeWidth={6} />
        </Animated.View>

        {/* Inner cyan halo — fakes SwiftUI's .blur(radius:15) glow underlay */}
        <Animated.View
          pointerEvents="none"
          style={[
            styles.eyeLayer,
            styles.haloInner,
            {
              opacity: haloOpacity,
              transform: [{ scale: haloScale }, { scaleY: blink }],
            },
          ]}>
          <AniseekrEye size={EYE_SIZE} color={PRIMARY_GLOW} strokeWidth={5} />
        </Animated.View>

        {/* Main white eye */}
        <Animated.View
          style={[
            styles.eyeLayer,
            styles.eyeMain,
            {
              opacity: eyeOpacity,
              transform: [{ scale: eyeScale }, { scaleY: blink }],
            },
          ]}>
          <AniseekrEye size={EYE_SIZE} color="#FFFFFF" strokeWidth={4} />
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
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bgGlow: {
    position: 'absolute',
    width: 360,
    height: 360,
    borderRadius: 180,
    alignSelf: 'center',
    top: '38%',
    backgroundColor: 'rgba(0, 255, 230, 0.18)',
    // iOS gets a real soft shadow that mimics the gaussian blur ball; Android
    // approximates with elevation since shadowRadius doesn't render the same.
    ...Platform.select({
      ios: {
        shadowColor: PRIMARY_GLOW,
        shadowOpacity: 0.9,
        shadowRadius: 80,
        shadowOffset: { width: 0, height: 0 },
      },
      android: {
        elevation: 24,
      },
      default: {},
    }),
  },
  ring: {
    position: 'absolute',
    width: 220,
    height: 220,
    borderRadius: 110,
    borderWidth: 1.5,
    borderColor: 'rgba(0, 255, 230, 0.55)',
  },
  eyeLayer: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  haloOuter: {
    ...Platform.select({
      ios: {
        shadowColor: PRIMARY_GLOW,
        shadowOpacity: 1,
        shadowRadius: 36,
        shadowOffset: { width: 0, height: 0 },
      },
      default: {},
    }),
  },
  haloInner: {
    ...Platform.select({
      ios: {
        shadowColor: PRIMARY_GLOW,
        shadowOpacity: 1,
        shadowRadius: 20,
        shadowOffset: { width: 0, height: 0 },
      },
      default: {},
    }),
  },
  eyeMain: {
    ...Platform.select({
      ios: {
        shadowColor: PRIMARY_GLOW,
        shadowOpacity: 0.7,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 0 },
      },
      default: {},
    }),
  },
});
