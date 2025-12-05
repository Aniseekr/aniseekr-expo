import 'react-native-gesture-handler';
import '../global.css';
import { Tabs } from 'expo-router';
import { View, Text } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <Tabs
        screenOptions={{
          headerShown: false,
        }}
      >
        <Tabs.Screen
          name="(rate)"
          options={{
            title: 'Home',
            tabBarIcon: ({ color }) => (
              <View style={{ width: 24, height: 24, alignItems: 'center', justifyContent: 'center' }}>
                <View style={{ width: 20, height: 20, borderRadius: 4, backgroundColor: color, opacity: 0.3 }} />
                <View style={{ position: 'absolute', width: 12, height: 12, borderRadius: 4, backgroundColor: color }} />
              </View>
            ),
          }}
        />
        <Tabs.Screen
          name="bangumi"
          options={{
            title: 'Bangumi',
            tabBarIcon: ({ color }) => (
              <View style={{ width: 24, height: 24, alignItems: 'center', justifyContent: 'center' }}>
                <View style={{ width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: color }} />
                <View style={{ position: 'absolute', width: 8, height: 8, borderRadius: 4, backgroundColor: color }} />
              </View>
            ),
          }}
        />
        <Tabs.Screen
          name="collection"
          options={{
            title: 'Collection',
            tabBarIcon: ({ color }) => (
              <View style={{ width: 24, height: 24, alignItems: 'center', justifyContent: 'center' }}>
                <View style={{ width: 16, height: 16, borderRadius: 2, borderWidth: 1, borderColor: color }} />
                <View style={{ position: 'absolute', top: 0, left: 0, width: 8, height: 8, borderRadius: 2, borderWidth: 1, borderColor: color }} />
              </View>
            ),
          }}
        />
        <Tabs.Screen
          name="gacha"
          options={{
            title: 'Gacha',
            tabBarIcon: ({ color }) => (
              <View style={{ width: 24, height: 24, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: 18 }}>🎁</Text>
              </View>
            ),
          }}
        />
        <Tabs.Screen
          name="profile"
          options={{
            title: 'Profile',
            tabBarIcon: ({ color }) => (
              <View style={{ width: 24, height: 24, alignItems: 'center', justifyContent: 'center' }}>
                <View style={{ width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: color }} />
                <View style={{ position: 'absolute', bottom: 0, width: 12, height: 12, borderRadius: 6, backgroundColor: color }} />
              </View>
            ),
          }}
        />
      </Tabs>
    </SafeAreaProvider>
  );
}
