import 'react-native-gesture-handler';
import '../global.css';
import { Tabs } from 'expo-router';
import { Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import FontAwesome5 from '@expo/vector-icons/FontAwesome5';

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
              ? 'rgba(18, 18, 18, 0.95)' // iOS uses system blur, but we provide fallback
              : '#121212', // Material Design dark surface
            borderTopWidth: Platform.OS === 'ios' ? 0.5 : 0,
            borderTopColor: Platform.OS === 'ios' ? 'rgba(255, 255, 255, 0.1)' : 'transparent',
            ...Platform.select({
              ios: {
                shadowColor: '#000',
                shadowOffset: { width: 0, height: -4 },
                shadowOpacity: 0.1,
                shadowRadius: 8,
              },
              android: {
                elevation: 8,
                borderTopWidth: 0,
              },
            }),
            paddingBottom: Platform.OS === 'ios' ? 20 : 8,
            paddingTop: 8,
          },
          tabBarActiveTintColor: Platform.OS === 'ios' ? '#007AFF' : '#6200EE', // iOS blue / Material primary
          tabBarInactiveTintColor: Platform.OS === 'ios' ? '#8E8E93' : '#9E9E9E', // iOS gray / Material gray
          tabBarLabelStyle: {
            fontSize: 10,
            fontWeight: Platform.OS === 'ios' ? '500' : '500',
            marginTop: 4,
            fontFamily: Platform.OS === 'ios' ? 'System' : 'Roboto',
          },
          tabBarIconStyle: {
            marginTop: Platform.OS === 'ios' ? 4 : 0,
          },
        }}
      >
        <Tabs.Screen
          name="(rate)"
          options={{
            title: 'Home',
            tabBarIcon: ({ color, size }) => <Ionicons name="home" size={size || 24} color={color} />,
          }}
        />
        <Tabs.Screen
          name="bangumi"
          options={{
            title: 'Bangumi',
            tabBarIcon: ({ color, size }) => <Ionicons name="calendar" size={size || 24} color={color} />,
          }}
        />
        <Tabs.Screen
          name="collection"
          options={{
            title: 'Collection',
            tabBarIcon: ({ color, size }) => <MaterialIcons name="collections" size={size || 24} color={color} />,
          }}
        />
        <Tabs.Screen
          name="gacha"
          options={{
            title: 'Gacha',
            tabBarIcon: ({ color, size }) => <FontAwesome5 name="gift" size={size || 24} color={color} />,
          }}
        />
        <Tabs.Screen
          name="profile"
          options={{
            title: 'Profile',
            tabBarIcon: ({ color, size }) => <Ionicons name="person-circle" size={size || 24} color={color} />,
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
