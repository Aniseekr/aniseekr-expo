import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import '../global.css';
import { useEffect, useRef, useState } from 'react';
import { Stack, usePathname, useRouter } from 'expo-router';
import { InteractionManager, Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as ScreenOrientation from 'expo-screen-orientation';
import * as Notifications from 'expo-notifications';
import { ThemeProvider } from '../context/ThemeContext';
import { SubscriptionProvider } from '../context/SubscriptionContext';
import { notificationService } from '../libs/services/notifications/notification-service';
import { routeForNotificationResponse } from '../libs/services/streaming/streaming-notification-route';
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
    // Critical-path: data fetches anywhere in the tree depend on this resolving,
    // so we kick it off immediately (still async — doesn't block the first paint).
    void dataSourceConfig.init().then(() => loadUserPrefs());

    // Rule 10: everything below is non-critical for the first frame. Defer it
    // past the initial interaction so analytics / auth / notification setup
    // doesn't compete with the JS thread while the launch screen crossfades
    // into the first route. Each service short-circuits when its local copy
    // is still fresh, so deferral is cheap on warm launches.
    const handle = InteractionManager.runAfterInteractions(() => {
      initClarity();
      void authService.initialize();
      void notificationService.initialize();
      void idMappingService.updateMappings().catch((e) => console.warn('[updateMappings]', e));
      void hydrateAllPilgrimageData().catch((e) => console.warn('[hydratePilgrimage]', e));
      void CacheManager.getInstance()
        .pruneAll()
        .then(({ totalRemoved }) => {
          if (totalRemoved > 0) {
            console.log(`[CacheManager] pruned ${totalRemoved} expired entries on boot`);
          }
        })
        .catch((e) => console.warn('[CacheManager.pruneAll]', e));
    });
    return () => handle.cancel();
  }, []);

  // Re-lock portrait only on initial mount or when leaving a camera-capture
  // path. Skipping the call on every regular navigation avoids a per-route
  // native bridge round-trip that the OS would otherwise no-op.
  const lastCameraPathRef = useRef<boolean | null>(null);
  useEffect(() => {
    if (Platform.OS === 'web') return;
    const onCamera = isCameraCapturePath(pathname);
    const previous = lastCameraPathRef.current;
    lastCameraPathRef.current = onCamera;
    if (onCamera) return;
    // previous === null  → first mount, lock portrait
    // previous === true  → leaving camera, restore portrait
    // previous === false → nav between non-camera screens, already locked
    if (previous === false) return;
    ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(
      () => undefined
    );
  }, [pathname]);

  // Episode reminders + daily digest deep-link: when the user taps a
  // notification, route to the right screen and (for episode_reminder) flag
  // openWatch=1 so the detail page can jump them straight to their primary
  // streaming platform. The unit test for routeForNotificationResponse
  // pins the routing contract; this effect only owns the side effect.
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const target = routeForNotificationResponse(response);
      if (!target) return;
      try {
        // expo-router supports string hrefs with query params.
        router.push(target as Parameters<typeof router.push>[0]);
      } catch (e) {
        console.warn('[Notifications] failed to route', target, e);
      }
    });
    return () => sub.remove();
  }, [router]);

  // Cold-launch case (separate effect with `[]` so it never re-fires when
  // `router` rebuilds — otherwise tapping a notification on cold launch
  // could double-route as the layout re-renders during bootstrap).
  useEffect(() => {
    void Notifications.getLastNotificationResponseAsync().then((response) => {
      if (!response) return;
      const target = routeForNotificationResponse(response);
      if (!target) return;
      try {
        router.push(target as Parameters<typeof router.push>[0]);
      } catch (e) {
        console.warn('[Notifications] failed to route from cold launch', target, e);
      }
    });
    // router is intentionally omitted — this runs once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    <GestureHandlerRootView style={{ flex: 1 }}>
      <KeyboardProvider>
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
      </KeyboardProvider>
    </GestureHandlerRootView>
  );
}
