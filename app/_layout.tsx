import 'react-native-gesture-handler';
import '../global.css';
import { useEffect, useState } from 'react';
import { Stack, usePathname, useRouter } from 'expo-router';
import { Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { ThemeProvider } from '../context/ThemeContext';
import { SubscriptionProvider } from '../context/SubscriptionContext';
import { notificationService } from '../libs/services/notifications/notification-service';
import { authService } from '../libs/services/auth/auth-service';
import { isOnboardingComplete } from '../libs/services/onboarding-service';
import { dataSourceConfig } from '../libs/services/data-source-config';
import { loadUserPrefs } from '../libs/services/user-prefs';
import { idMappingService } from '../libs/services/sync/id-mapping-service';

export default function RootLayout() {
  const router = useRouter();
  const pathname = usePathname();
  const [onboardingChecked, setOnboardingChecked] = useState(false);

  useEffect(() => {
    void authService.initialize();
    void notificationService.initialize();
    // Hydrate the data-source config (browseSource + allowR18Content) before
    // any list fetch runs. `loadUserPrefs` then mirrors the user's adult-
    // content choice into dataSourceConfig so the read pipeline filters
    // even when the toggle was last touched on a previous launch.
    void dataSourceConfig.init().then(() => loadUserPrefs());
    // Refresh the cross-platform ID mapping table on a tick after the first
    // render. The service itself short-circuits when the local copy is < 14d
    // old, so this is cheap on warm launches. Errors are swallowed (the next
    // launch retries) so a flaky network can never block boot.
    setTimeout(() => {
      void idMappingService
        .updateMappings()
        .catch((e) => console.warn('[updateMappings]', e));
    }, 0);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const done = await isOnboardingComplete();
      if (cancelled) return;
      setOnboardingChecked(true);
      if (!done && pathname !== '/onboarding') {
        router.replace('/onboarding');
      }
    })();
    return () => {
      cancelled = true;
    };
    // pathname intentionally excluded — we only gate once on bootstrap; later
    // nav back to /onboarding (e.g. via dev reset) is handled by the user.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Avoid a flash of tabs before the gate decides where to send us.
  void onboardingChecked;

  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <SubscriptionProvider>
          <StatusBar style="light" translucent={Platform.OS === 'android'} />
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="(setting)" />
            <Stack.Screen name="anime/[id]" />
            <Stack.Screen name="search" />
            <Stack.Screen name="onboarding" />
            <Stack.Screen name="index" />
          </Stack>
        </SubscriptionProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
