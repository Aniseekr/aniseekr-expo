import 'react-native-gesture-handler';
import '../global.css';
import { useEffect, useState } from 'react';
import { Tabs, usePathname, useRouter } from 'expo-router';
import { Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import FloatingTabBar from '../components/FloatingTabBar';
import { ThemeProvider } from '../context/ThemeContext';
import { SubscriptionProvider } from '../context/SubscriptionContext';
import { notificationService } from '../libs/services/notifications/notification-service';
import { authService } from '../libs/services/auth/auth-service';
import { isOnboardingComplete } from '../libs/services/onboarding-service';

export default function RootLayout() {
  const router = useRouter();
  const pathname = usePathname();
  const [onboardingChecked, setOnboardingChecked] = useState(false);

  useEffect(() => {
    void authService.initialize();
    void notificationService.initialize();
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
          <Tabs
            tabBar={(props) => <FloatingTabBar {...props} />}
            screenOptions={{
              headerShown: false,
              tabBarActiveTintColor: '#fff',
              tabBarInactiveTintColor: '#FFFFFF60',
            }}>
            <Tabs.Screen
              name="(rate)"
              options={{
                title: 'Home',
                tabBarIcon: ({ color }) => (
                  <MaterialIcons name="home-filled" size={26} color={color} />
                ),
              }}
            />
            <Tabs.Screen
              name="bangumi"
              options={{
                title: 'Bangumi',
                tabBarIcon: ({ color }) => (
                  <MaterialIcons name="date-range" size={24} color={color} />
                ),
              }}
            />
            <Tabs.Screen
              name="collection"
              options={{
                title: 'Collection',
                tabBarIcon: ({ color }) => (
                  <MaterialIcons name="bookmark" size={24} color={color} />
                ),
              }}
            />
            <Tabs.Screen
              name="pilgrimage/index"
              options={{
                title: 'Pilgrimage',
                tabBarIcon: ({ color }) => <MaterialIcons name="place" size={24} color={color} />,
              }}
            />
            <Tabs.Screen
              name="profile"
              options={{
                title: 'Profile',
                tabBarIcon: ({ color }) => <MaterialIcons name="person" size={26} color={color} />,
              }}
            />
            <Tabs.Screen
              name="(setting)/settings"
              options={{ href: null, tabBarStyle: { display: 'none' }, headerShown: false }}
            />
            <Tabs.Screen
              name="(setting)/sync"
              options={{ href: null, tabBarStyle: { display: 'none' }, headerShown: false }}
            />
            <Tabs.Screen
              name="(setting)/data-source"
              options={{ href: null, tabBarStyle: { display: 'none' }, headerShown: false }}
            />
            <Tabs.Screen
              name="(setting)/theme"
              options={{ href: null, tabBarStyle: { display: 'none' }, headerShown: false }}
            />
            <Tabs.Screen
              name="(setting)/cache"
              options={{ href: null, tabBarStyle: { display: 'none' }, headerShown: false }}
            />
            <Tabs.Screen
              name="(setting)/language-priority"
              options={{ href: null, tabBarStyle: { display: 'none' }, headerShown: false }}
            />
            <Tabs.Screen
              name="(setting)/attribution"
              options={{ href: null, tabBarStyle: { display: 'none' }, headerShown: false }}
            />
            <Tabs.Screen
              name="(setting)/privacy"
              options={{ href: null, tabBarStyle: { display: 'none' }, headerShown: false }}
            />
            <Tabs.Screen
              name="(setting)/terms"
              options={{ href: null, tabBarStyle: { display: 'none' }, headerShown: false }}
            />
            <Tabs.Screen
              name="(setting)/notifications"
              options={{ href: null, tabBarStyle: { display: 'none' }, headerShown: false }}
            />
            <Tabs.Screen
              name="(setting)/account"
              options={{ href: null, tabBarStyle: { display: 'none' }, headerShown: false }}
            />
            <Tabs.Screen
              name="(setting)/otaku-dna"
              options={{ href: null, tabBarStyle: { display: 'none' }, headerShown: false }}
            />
            <Tabs.Screen
              name="(setting)/import-wizard"
              options={{ href: null, tabBarStyle: { display: 'none' }, headerShown: false }}
            />
            <Tabs.Screen
              name="(setting)/sync-hub"
              options={{ href: null, tabBarStyle: { display: 'none' }, headerShown: false }}
            />
            <Tabs.Screen
              name="(setting)/achievements"
              options={{ href: null, tabBarStyle: { display: 'none' }, headerShown: false }}
            />
            <Tabs.Screen
              name="(setting)/accent-color"
              options={{ href: null, tabBarStyle: { display: 'none' }, headerShown: false }}
            />
            <Tabs.Screen
              name="(setting)/custom-color"
              options={{ href: null, tabBarStyle: { display: 'none' }, headerShown: false }}
            />
            <Tabs.Screen
              name="(setting)/theme-mode"
              options={{ href: null, tabBarStyle: { display: 'none' }, headerShown: false }}
            />
            <Tabs.Screen
              name="(setting)/theme-preview"
              options={{ href: null, tabBarStyle: { display: 'none' }, headerShown: false }}
            />
            <Tabs.Screen
              name="(setting)/design-tokens"
              options={{ href: null, tabBarStyle: { display: 'none' }, headerShown: false }}
            />
            <Tabs.Screen
              name="collection/[id]"
              options={{ href: null, tabBarStyle: { display: 'none' }, headerShown: false }}
            />
            <Tabs.Screen
              name="collection/stats"
              options={{ href: null, tabBarStyle: { display: 'none' }, headerShown: false }}
            />
            <Tabs.Screen
              name="pilgrimage/[animeId]"
              options={{ href: null, tabBarStyle: { display: 'none' }, headerShown: false }}
            />
            <Tabs.Screen
              name="search"
              options={{ href: null, tabBarStyle: { display: 'none' }, headerShown: false }}
            />
            {/* Splash screen - hidden from tab bar */}
            <Tabs.Screen
              name="index"
              options={{ href: null, tabBarStyle: { display: 'none' }, headerShown: false }}
            />
            <Tabs.Screen
              name="onboarding"
              options={{ href: null, tabBarStyle: { display: 'none' }, headerShown: false }}
            />
          </Tabs>
        </SubscriptionProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
