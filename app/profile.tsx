import { View, ScrollView, RefreshControl } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useState, useCallback, useEffect } from 'react';
import { ProfileHeader } from '../components/profile/ProfileHeader';
import { CollectionStats } from '../components/profile/CollectionStats';
import { QuickActions } from '../components/profile/QuickActions';
import { LinearGradient } from 'expo-linear-gradient';
import { UserRepository, UserProfile } from '../libs/user-repository';
import { router } from 'expo-router';

export default function ProfileScreen() {
  const { top } = useSafeAreaInsets();
  const [refreshing, setRefreshing] = useState(false);
  const [user, setUser] = useState<UserProfile | null>(null);

  const loadData = useCallback(async () => {
    try {
      const data = await UserRepository.getProfile();
      setUser(data);
    } catch (e) {
      console.error(e);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }, [loadData]);

  // Default stats for loading state
  const defaultStats = { totalRated: 0, likedCount: 0, cardsCount: 0, foldersCount: 0 };

  return (
    <View className="flex-1 bg-bg-dark">
      <LinearGradient
        colors={['#1a1b2e', '#13131f', '#0f0f16']}
        className="absolute inset-0"
      />
      <SafeAreaView style={{ paddingTop: top }} className="flex-1">
        <ScrollView
            className="flex-1"
            contentContainerStyle={{ paddingBottom: 100 }}
            refreshControl={<RefreshControl tintColor="#fff" refreshing={refreshing} onRefresh={onRefresh} />}
        >
            <ProfileHeader 
                username={user ? user.username : "Loading..."}
                profileImageURL={user ? user.avatarUrl : ""}
                isDonator={user ? user.isDonator : false}
            />
            
            <CollectionStats 
                stats={user ? user.stats : defaultStats}
            />

            <QuickActions 
                actions={{
                    onPremium: () => {},
                    onSync: () => {},
                    onSettings: () => router.push("/(setting)/settings"),
                    onBackup: () => {},
                    onDNA: () => {},
                }}
            />
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
