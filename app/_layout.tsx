import { GestureHandlerRootView } from 'react-native-gesture-handler';
import '../global.css';
import { useEffect, useState } from 'react';
import { Stack, usePathname, useRouter } from 'expo-router';
import { Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as ScreenOrientation from 'expo-screen-orientation';
import { ThemeProvider } from '../context/ThemeContext';
import { SubscriptionProvider } from '../context/SubscriptionContext';
import { notificationService } from '../libs/services/notifications/notification-service';
import { initClarity } from '../libs/services/analytics/clarity';
import { authService } from '../libs/services/auth/auth-service';
import { isOnboardingComplete } from '../libs/services/onboarding-service';
import { dataSourceConfig } from '../libs/services/data-source-config';
import { loadUserPrefs } from '../libs/services/user-prefs';
import { idMappingService } from '../libs/services/sync/id-mapping-service';
import { hydrateAllPilgrimageData } from '../libs/services/pilgrimage/anitabi-data-service';
import { CacheManager } from '../libs/services/cache/cache-manager';
import { isCameraCapturePath } from '../libs/services/pilgrimage/camera-ui';

export default function RootLayout() {
  const router = useRouter();
  const pathname = usePathname();
  const [onboardingChecked, setOnboardingChecked] = useState(false);

  useEffect(() => {
    initClarity();
    void authService.initialize();
    void notificationService.initialize();
    // Hydrate the data-source config (browseSource + allowR18Content) before
    // any list fetch runs. `loadUserPrefs` then mirrors the user's adult-
    // content choice into dataSourceConfig so the read pipeline filters
    // even when the toggle was last touched on a previous launch.
    void dataSourceConfig.init().then(() => loadUserPrefs());
    // Refresh long-lived data on a tick after the first render. Each service
    // short-circuits when its local copy is still fresh (mappings: 14d,
    // anitabi data: 7d) so this is cheap on warm launches. Errors are
    // swallowed (the next launch retries) so a flaky network can never block
    // boot — the bundled fallbacks keep both features working offline.
    setTimeout(() => {
      void idMappingService.updateMappings().catch((e) => console.warn('[updateMappings]', e));
      void hydrateAllPilgrimageData().catch((e) => console.warn('[hydratePilgrimage]', e));
      // Drop expired cache rows once per cold launch. Bucket failures are
      // logged inside pruneAll, so a broken bucket can never block boot.
      void CacheManager.getInstance()
        .pruneAll()
        .then(({ totalRemoved }) => {
          if (totalRemoved > 0) {
            console.log(`[CacheManager] pruned ${totalRemoved} expired entries on boot`);
          }
        })
        .catch((e) => console.warn('[CacheManager.pruneAll]', e));
    }, 0);
  }, []);

  useEffect(() => {
    if (Platform.OS === 'web' || isCameraCapturePath(pathname)) return;
    ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(
      () => undefined
    );
  }, [pathname]);

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
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider>
          <SubscriptionProvider>
            <StatusBar style="light" translucent={Platform.OS === 'android'} />
            <Stack screenOptions={{ headerShown: false }}>
              <Stack.Screen name="(tabs)" />
              <Stack.Screen name="(setting)" />
              <Stack.Screen name="anime/[id]" />
              <Stack.Screen name="search" />
              <Stack.Screen name="trending" />
              <Stack.Screen name="onboarding" />
              <Stack.Screen name="index" />
            </Stack>
          </SubscriptionProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
