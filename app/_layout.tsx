import 'react-native-gesture-handler';
import '../global.css';
import { Tabs } from 'expo-router';
import { Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarStyle: {
            position: 'absolute',
            bottom: Platform.OS === 'ios' ? 0 : 0,
            left: 0,
            right: 0,
            height: Platform.OS === 'ios' ? 88 : 70,
            backgroundColor: Platform.OS === 'ios' 
              ? 'rgba(18, 18, 18, 0.95)' 
              : '#121212', 
            borderTopWidth: 0,
            borderTopColor: 'transparent',
            ...Platform.select({
              ios: {
                shadowColor: '#000',
                shadowOffset: { width: 0, height: -4 },
                shadowOpacity: 0.1,
                shadowRadius: 8,
              },
              android: {
                elevation: 8,
              },
            }),
            paddingBottom: Platform.OS === 'ios' ? 20 : 12,
            paddingTop: 12,
          },
          tabBarActiveTintColor: '#fff', 
          tabBarInactiveTintColor: '#FFFFFF60',
          tabBarLabelStyle: {
            fontSize: 10,
            fontWeight: '500',
            marginTop: 4,
            fontFamily: Platform.OS === 'ios' ? 'System' : 'Roboto',
          },
          tabBarIconStyle: {
            // marginTop: 4,
          },
        }}
      >
        <Tabs.Screen
          name="(rate)"
          options={{
            title: 'Home',
            tabBarIcon: ({ color, size }) => <MaterialIcons name="home-filled" size={26} color={color} />,
          }}
        />
        <Tabs.Screen
          name="bangumi"
          options={{
            title: 'Bangumi',
            tabBarIcon: ({ color, size }) => <MaterialIcons name="calendar-today" size={24} color={color} />,
          }}
        />
        <Tabs.Screen
          name="collection"
          options={{
            title: 'Collection',
            tabBarIcon: ({ color, size }) => <MaterialIcons name="collections" size={24} color={color} />,
          }}
        />
        <Tabs.Screen
          name="gacha"
          options={{
            title: 'Gacha',
            tabBarIcon: ({ color, size }) => <MaterialIcons name="card-giftcard" size={24} color={color} />,
          }}
        />
        <Tabs.Screen
          name="profile"
          options={{
            title: 'Profile',
            tabBarIcon: ({ color, size }) => <MaterialIcons name="person" size={26} color={color} />,
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
      </Tabs>
    </SafeAreaProvider>
  );
}
