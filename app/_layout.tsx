import 'react-native-gesture-handler';
import '../global.css';
import { Tabs } from 'expo-router';
import { Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import FloatingTabBar from '../components/FloatingTabBar';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
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
            tabBarIcon: ({ color, size }) => (
              <MaterialIcons name="home-filled" size={26} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="bangumi"
          options={{
            title: 'Bangumi',
            tabBarIcon: ({ color, size }) => (
              <MaterialIcons name="calendar-today" size={24} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="collection"
          options={{
            title: 'Collection',
            tabBarIcon: ({ color, size }) => (
              <MaterialIcons name="collections" size={24} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="gacha"
          options={{
            title: 'Gacha',
            tabBarIcon: ({ color, size }) => (
              <MaterialIcons name="card-giftcard" size={24} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="profile"
          options={{
            title: 'Profile',
            tabBarIcon: ({ color, size }) => (
              <MaterialIcons name="person" size={26} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="(setting)/settings"
          options={{
            href: null,
            tabBarStyle: { display: 'none' },
            headerShown: false,
          }}
        />
        <Tabs.Screen
          name="(setting)/sync"
          options={{
            href: null,
            tabBarStyle: { display: 'none' },
            headerShown: false,
          }}
        />
        <Tabs.Screen
          name="collection/[id]"
          options={{
            href: null,
            tabBarStyle: { display: 'none' },
            headerShown: false,
          }}
        />
        {/* Splash screen - hidden from tab bar */}
        <Tabs.Screen
          name="index"
          options={{
            href: null,
            tabBarStyle: { display: 'none' },
            headerShown: false,
          }}
        />
      </Tabs>
    </SafeAreaProvider>
  );
}
