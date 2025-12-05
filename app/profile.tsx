import { ScrollView, Text, View, RefreshControl } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useState, useCallback } from 'react';
import { GlassCard } from '../components/common/GlassCard';

export default function ProfileScreen() {
  const { top } = useSafeAreaInsets();
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 1000);
  }, []);

  return (
    <SafeAreaView style={{ paddingTop: top }} className="flex-1 bg-bg-dark">
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ padding: 16, gap: 16 }}
        refreshControl={<RefreshControl tintColor="#fff" refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <GlassCard className="p-6">
          <Text className="text-white text-2xl font-bold mb-2">Profile</Text>
          <Text className="text-white/70 text-sm">Account and settings</Text>
        </GlassCard>

        <GlassCard className="p-6">
          <Text className="text-white text-lg font-semibold mb-4">Coming Soon</Text>
          <Text className="text-white/70">
            This tab will display user profile, account settings, and app preferences. Connect to authentication and settings.
          </Text>
        </GlassCard>
      </ScrollView>
    </SafeAreaView>
  );
}

