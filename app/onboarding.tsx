import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import * as Notifications from 'expo-notifications';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, Radius, Spacing, Typography } from '../constants/DesignSystem';
import { hapticsBridge } from '../modules/haptics/hapticsBridge';
import { useTheme } from '../context/ThemeContext';
import { ThemedButton } from '../components/themed';
import {
  BROWSE_SUPPORTED_PLATFORMS,
  DEFAULT_BROWSE_SOURCE,
  dataSourceConfig,
} from '../libs/services/data-source-config';
import { PLATFORM_CONFIGS, type PlatformType } from '../libs/services/auth/types';
import { patchUserPrefs } from '../libs/services/user-prefs';
import { markOnboardingComplete } from '../libs/services/onboarding-service';
import { useT } from '../libs/i18n';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const STEP_GRADIENTS: [string, string, ...string[]][] = [
  ['#1A0B2E', '#3D1A6B', '#1A0B2E'],
  ['#2C1810', '#7A3B1F', '#2C1810'],
  ['#04101A', '#0A1F30', '#04101A'],
  ['#0B1F1A', '#13452F', '#0B1F1A'],
  ['#180A06', '#FF9F0A22', '#180A06'],
];

const STEPS = ['welcome', 'browseSource', 'notifications', 'adultContent', 'done'] as const;

const BROWSE_OPTIONS: PlatformType[] = ['anilist', 'myanimelist', 'bangumi', 'kitsu'];

export default function OnboardingScreen() {
  const router = useRouter();
  const { theme } = useTheme();
  const t = useT();
  const scrollRef = useRef<ScrollView>(null);
  const scrollX = useRef(new Animated.Value(0)).current;
  const [stepIndex, setStepIndex] = useState(0);
  const [browseSource, setBrowseSource] = useState<PlatformType>(DEFAULT_BROWSE_SOURCE);
  const [notifGranted, setNotifGranted] = useState<boolean | null>(null);
  const [notifBusy, setNotifBusy] = useState(false);
  const [allowAdult, setAllowAdult] = useState(false);
  const [completing, setCompleting] = useState(false);

  const goToStep = useCallback((idx: number) => {
    scrollRef.current?.scrollTo({ x: idx * SCREEN_WIDTH, animated: true });
  }, []);

  const onMomentumEnd = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const idx = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH);
      if (idx !== stepIndex) {
        setStepIndex(idx);
        hapticsBridge.tap();
      }
    },
    [stepIndex]
  );

  const handleSelectBrowseSource = useCallback((platform: PlatformType) => {
    hapticsBridge.selection();
    setBrowseSource(platform);
  }, []);

  const handleAllowNotifications = useCallback(async () => {
    setNotifBusy(true);
    try {
      const status = await Notifications.requestPermissionsAsync();
      setNotifGranted(status.granted === true);
      hapticsBridge.success();
    } catch {
      setNotifGranted(false);
    } finally {
      setNotifBusy(false);
      goToStep(stepIndex + 1);
    }
  }, [goToStep, stepIndex]);

  const handleSkipNotifications = useCallback(() => {
    setNotifGranted(false);
    hapticsBridge.tap();
    goToStep(stepIndex + 1);
  }, [goToStep, stepIndex]);

  const handleToggleAdult = useCallback((value: boolean) => {
    hapticsBridge.selection();
    setAllowAdult(value);
  }, []);

  const handleFinish = useCallback(async () => {
    if (completing) return;
    setCompleting(true);
    try {
      await dataSourceConfig.init();
      await dataSourceConfig.setBrowseSource(browseSource);
      await patchUserPrefs({ allowAdultContent: allowAdult });
      await markOnboardingComplete();
      hapticsBridge.success();
    } catch {
      // best-effort: never block the user from entering the app
    } finally {
      router.replace('/(rate)');
    }
  }, [allowAdult, browseSource, completing, router]);

  const skipToLast = useCallback(() => {
    hapticsBridge.tap();
    goToStep(STEPS.length - 1);
  }, [goToStep]);

  useEffect(() => {
    void dataSourceConfig.init();
  }, []);

  const currentGradient = STEP_GRADIENTS[stepIndex] ?? STEP_GRADIENTS[0];

  return (
    <View style={styles.root}>
      <Animated.View style={StyleSheet.absoluteFill}>
        <LinearGradient colors={currentGradient} style={StyleSheet.absoluteFill} />
      </Animated.View>

      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <View style={styles.topBar}>
          {stepIndex < STEPS.length - 1 ? (
            <Pressable
              onPress={skipToLast}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel={t('onboarding.skipA11y')}>
              <Text style={styles.skipText}>{t('onboarding.skip')}</Text>
            </Pressable>
          ) : (
            <View />
          )}
        </View>

        <Animated.ScrollView
          ref={scrollRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onScroll={Animated.event([{ nativeEvent: { contentOffset: { x: scrollX } } }], {
            useNativeDriver: true,
          })}
          onMomentumScrollEnd={onMomentumEnd}
          scrollEventThrottle={16}
          bounces={false}
          style={styles.pager}>
          <WelcomeStep onContinue={() => goToStep(1)} t={t} />
          <BrowseSourceStep
            selected={browseSource}
            onSelect={handleSelectBrowseSource}
            onContinue={() => goToStep(2)}
            t={t}
          />
          <NotificationsStep
            granted={notifGranted}
            busy={notifBusy}
            onAllow={handleAllowNotifications}
            onSkip={handleSkipNotifications}
            t={t}
          />
          <AdultContentStep
            value={allowAdult}
            onToggle={handleToggleAdult}
            onContinue={() => goToStep(4)}
            accent={theme.accent}
            t={t}
          />
          <DoneStep onFinish={handleFinish} busy={completing} t={t} />
        </Animated.ScrollView>

        <DotIndicator count={STEPS.length} active={stepIndex} accent={theme.accent} />
      </SafeAreaView>
    </View>
  );
}

type T = ReturnType<typeof useT>;

function WelcomeStep({ onContinue, t }: { onContinue: () => void; t: T }) {
  return (
    <View style={styles.page}>
      <View style={styles.iconHalo}>
        <MaterialIcons name="remove-red-eye" size={96} color="#FFFFFF" />
      </View>
      <Text style={styles.wordmark}>Aniseekr</Text>
      <Text style={styles.tagline}>{t('onboarding.welcome.tagline')}</Text>
      <Text style={styles.subtitle}>{t('onboarding.welcome.subtitle')}</Text>
      <ThemedButton label={t('onboarding.welcome.cta')} onPress={onContinue} size="lg" fullWidth />
    </View>
  );
}

function BrowseSourceStep({
  selected,
  onSelect,
  onContinue,
  t,
}: {
  selected: PlatformType;
  onSelect: (p: PlatformType) => void;
  onContinue: () => void;
  t: T;
}) {
  return (
    <View style={styles.page}>
      <MaterialIcons name="travel-explore" size={96} color="#FFFFFF" />
      <Text style={styles.title}>{t('onboarding.browseSource.title')}</Text>
      <Text style={styles.body}>{t('onboarding.browseSource.body')}</Text>
      <View style={styles.cardGrid}>
        {BROWSE_OPTIONS.filter((p) =>
          (BROWSE_SUPPORTED_PLATFORMS as readonly PlatformType[]).includes(p)
        ).map((p) => {
          const config = PLATFORM_CONFIGS[p];
          const active = selected === p;
          return (
            <Pressable
              key={p}
              onPress={() => onSelect(p)}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              style={({ pressed }) => [
                styles.sourceCard,
                {
                  borderColor: active ? config.color : Colors.glass.border,
                  backgroundColor: active ? `${config.color}26` : Colors.glass.dark,
                },
                pressed && { opacity: 0.85 },
              ]}>
              <View style={[styles.sourceDot, { backgroundColor: config.color }]} />
              <Text style={styles.sourceName}>{config.displayName}</Text>
              {active ? (
                <MaterialIcons name="check-circle" size={20} color={config.color} />
              ) : (
                <View style={styles.sourceCheckPlaceholder} />
              )}
            </Pressable>
          );
        })}
      </View>
      <ThemedButton label={t('onboarding.browseSource.cta')} onPress={onContinue} size="lg" fullWidth />
    </View>
  );
}

function NotificationsStep({
  granted,
  busy,
  onAllow,
  onSkip,
  t,
}: {
  granted: boolean | null;
  busy: boolean;
  onAllow: () => void;
  onSkip: () => void;
  t: T;
}) {
  return (
    <View style={styles.page}>
      <MaterialIcons name="notifications-active" size={96} color="#FFFFFF" />
      <Text style={styles.title}>{t('onboarding.notifications.title')}</Text>
      <Text style={styles.body}>{t('onboarding.notifications.body')}</Text>
      {granted === true ? (
        <View style={styles.statusPill}>
          <MaterialIcons name="check-circle" size={16} color={Colors.success} />
          <Text style={styles.statusPillText}>{t('onboarding.notifications.allowed')}</Text>
        </View>
      ) : null}
      <View style={styles.buttonRow}>
        <View style={styles.buttonRowItem}>
          <ThemedButton
            variant="secondary"
            label={t('onboarding.notifications.maybeLater')}
            onPress={onSkip}
            disabled={busy}
            size="lg"
            fullWidth
          />
        </View>
        <View style={styles.buttonRowItem}>
          <ThemedButton
            label={busy ? t('onboarding.notifications.asking') : t('onboarding.notifications.allow')}
            onPress={onAllow}
            loading={busy}
            size="lg"
            fullWidth
          />
        </View>
      </View>
    </View>
  );
}

function AdultContentStep({
  value,
  onToggle,
  onContinue,
  accent,
  t,
}: {
  value: boolean;
  onToggle: (v: boolean) => void;
  onContinue: () => void;
  accent: string;
  t: T;
}) {
  return (
    <View style={styles.page}>
      <MaterialIcons name="explicit" size={96} color="#FFFFFF" />
      <Text style={styles.title}>{t('onboarding.adult.title')}</Text>
      <Text style={styles.body}>{t('onboarding.adult.body')}</Text>
      <View style={styles.toggleRow}>
        <View style={styles.toggleCopy}>
          <Text style={styles.toggleTitle}>{t('onboarding.adult.toggleTitle')}</Text>
          <Text style={styles.toggleSubtitle}>{t('onboarding.adult.toggleSubtitle')}</Text>
        </View>
        <Switch
          value={value}
          onValueChange={onToggle}
          trackColor={{ true: accent, false: 'rgba(255,255,255,0.2)' }}
          thumbColor="#FFFFFF"
        />
      </View>
      <ThemedButton label={t('onboarding.adult.cta')} onPress={onContinue} size="lg" fullWidth />
    </View>
  );
}

function DoneStep({ onFinish, busy, t }: { onFinish: () => void; busy: boolean; t: T }) {
  return (
    <View style={styles.page}>
      <MaterialIcons name="celebration" size={96} color="#FFFFFF" />
      <Text style={styles.title}>{t('onboarding.done.title')}</Text>
      <Text style={styles.body}>{t('onboarding.done.body')}</Text>
      <ThemedButton
        label={busy ? t('onboarding.done.busy') : t('onboarding.done.cta')}
        onPress={onFinish}
        loading={busy}
        size="lg"
        fullWidth
        haptic="success"
      />
    </View>
  );
}

function DotIndicator({
  count,
  active,
  accent,
}: {
  count: number;
  active: number;
  accent: string;
}) {
  const dots = useMemo(() => Array.from({ length: count }, (_, i) => i), [count]);
  return (
    <View style={styles.dots}>
      {dots.map((i) => {
        const isActive = i === active;
        return (
          <View
            key={i}
            style={[
              styles.dot,
              {
                backgroundColor: isActive ? accent : 'rgba(255,255,255,0.25)',
                width: isActive ? 24 : 8,
              },
            ]}
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#000',
  },
  safeArea: {
    flex: 1,
  },
  topBar: {
    height: 44,
    paddingHorizontal: Spacing.lg,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  skipText: {
    ...Typography.titleMedium,
    color: 'rgba(255,255,255,0.7)',
  },
  pager: {
    flex: 1,
  },
  page: {
    width: SCREEN_WIDTH,
    flex: 1,
    paddingHorizontal: Spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.lg,
  },
  iconHalo: {
    width: 144,
    height: 144,
    borderRadius: 72,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: Colors.glass.border,
  },
  wordmark: {
    ...Typography.displayLarge,
    color: '#FFFFFF',
    textAlign: 'center',
  },
  tagline: {
    ...Typography.bodyLarge,
    color: 'rgba(255,255,255,0.85)',
    textAlign: 'center',
    paddingHorizontal: Spacing.md,
  },
  subtitle: {
    ...Typography.titleMedium,
    color: 'rgba(255,255,255,0.55)',
    textAlign: 'center',
  },
  title: {
    ...Typography.headlineLarge,
    color: '#FFFFFF',
    textAlign: 'center',
  },
  body: {
    ...Typography.bodyMedium,
    color: 'rgba(255,255,255,0.75)',
    textAlign: 'center',
    paddingHorizontal: Spacing.md,
  },
  cardGrid: {
    width: '100%',
    gap: Spacing.sm,
  },
  sourceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    padding: Spacing.md,
    borderRadius: Radius.card,
    borderWidth: 1.5,
  },
  sourceDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  sourceName: {
    ...Typography.titleLarge,
    color: '#FFFFFF',
    flex: 1,
  },
  sourceCheckPlaceholder: {
    width: 20,
    height: 20,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    width: '100%',
  },
  buttonRowItem: {
    flex: 1,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    padding: Spacing.md,
    borderRadius: Radius.card,
    backgroundColor: Colors.glass.dark,
    borderWidth: 1,
    borderColor: Colors.glass.border,
  },
  toggleCopy: {
    flex: 1,
  },
  toggleTitle: {
    ...Typography.titleLarge,
    color: '#FFFFFF',
  },
  toggleSubtitle: {
    ...Typography.bodySmall,
    color: 'rgba(255,255,255,0.5)',
    marginTop: 2,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: Radius.full,
    backgroundColor: 'rgba(48,209,88,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(48,209,88,0.4)',
  },
  statusPillText: {
    ...Typography.titleSmall,
    color: Colors.success,
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: Spacing.lg,
    gap: 6,
  },
  dot: {
    height: 8,
    borderRadius: 4,
  },
});
