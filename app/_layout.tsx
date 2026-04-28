import 'react-native-gesture-handler';
import '../global.css';
import { useEffect } from 'react';
import { Tabs } from 'expo-router';
import { Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import FloatingTabBar from '../components/FloatingTabBar';
import { ThemeProvider } from '../context/ThemeContext';
import { SubscriptionProvider, useSubscription } from '../context/SubscriptionContext';
import { notificationService } from '../libs/services/notifications/notification-service';
import { authService } from '../libs/services/auth/auth-service';
import { adsService } from '../libs/services/ads/ads-service';

export default function RootLayout() {
  useEffect(() => {
    void authService.initialize();
    void notificationService.initialize();
    void adsService.initialize();
  }, []);

  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <SubscriptionProvider>
        <AdGate />
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
                <MaterialIcons name="calendar-today" size={24} color={color} />
              ),
            }}
          />
          <Tabs.Screen
            name="collection"
            options={{
              title: 'Collection',
              tabBarIcon: ({ color }) => (
                <MaterialIcons name="collections" size={24} color={color} />
              ),
            }}
          />
          {/* Platform conditional: Android replaces Gacha with Pilgrimage. iOS keeps Pilgrimage (no Gacha route shipped — gacha is an iOS-platform-specific feature staged via components/gacha but skipped from the Expo port per spec). */}
          <Tabs.Screen
            name="pilgrimage/index"
            options={{
              title: Platform.OS === 'android' ? '聖地巡禮' : 'Pilgrimage',
              tabBarIcon: ({ color }) => (
                <MaterialIcons name="explore" size={24} color={color} />
              ),
            }}
          />
          <Tabs.Screen
            name="profile"
            options={{
              title: 'Profile',
              tabBarIcon: ({ color }) => (
                <MaterialIcons name="person" size={26} color={color} />
              ),
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
        </Tabs>
        </SubscriptionProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

function AdGate() {
  const { isPro } = useSubscription();
  useEffect(() => {
    adsService.setSuppressed(isPro);
    if (!isPro) {
      void adsService.preloadInterstitial();
      void adsService.preloadRewarded();
    }
  }, [isPro]);
  return null;
}
