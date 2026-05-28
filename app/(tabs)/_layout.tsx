import { Tabs } from 'expo-router';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import FloatingTabBar from '../../components/FloatingTabBar';
import { useT } from '../../libs/i18n';

export default function TabsLayout() {
  const t = useT();
  return (
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
          title: t('tabs.rate'),
          tabBarIcon: ({ color }) => <MaterialIcons name="home-filled" size={26} color={color} />,
        }}
      />
      <Tabs.Screen
        name="bangumi"
        options={{
          title: t('tabs.bangumi'),
          tabBarIcon: ({ color }) => <MaterialIcons name="date-range" size={24} color={color} />,
        }}
      />
      <Tabs.Screen
        name="collection"
        options={{
          title: t('tabs.collection'),
          tabBarIcon: ({ color }) => <MaterialIcons name="bookmark" size={24} color={color} />,
        }}
      />
      <Tabs.Screen
        name="pilgrimage"
        options={{
          title: t('tabs.pilgrimage'),
          tabBarIcon: ({ color }) => <MaterialIcons name="place" size={24} color={color} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: t('tabs.profile'),
          tabBarIcon: ({ color }) => <MaterialIcons name="person" size={26} color={color} />,
        }}
      />
    </Tabs>
  );
}
