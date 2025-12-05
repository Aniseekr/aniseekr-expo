import { View, ScrollView, RefreshControl, Platform, StyleSheet } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useState, useCallback, useEffect } from 'react';
import { ProfileHeader } from '../components/profile/ProfileHeader';
import { CollectionStats } from '../components/profile/CollectionStats';
import { QuickActions } from '../components/profile/QuickActions';
import { LinearGradient } from 'expo-linear-gradient';
import { UserRepository, UserProfile } from '../libs/user-repository';
import { router } from 'expo-router';
import { gachaService } from '../libs/gacha-service';

export default function ProfileScreen() {
  const { top } = useSafeAreaInsets();
  const [refreshing, setRefreshing] = useState(false);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [cardsCount, setCardsCount] = useState(0);
  const [coins, setCoins] = useState(0);
  const [shards, setShards] = useState(0);

  const loadData = useCallback(async () => {
    try {
      const data = await UserRepository.getProfile();
      setUser(data);
      
      // Load gacha data
      try {
        const cards = await gachaService.getUserCards();
        const userCoins = await gachaService.getCoins();
        const userShards = await gachaService.getShards();
        setCardsCount(cards.length);
        setCoins(userCoins);
        setShards(userShards);
      } catch (e) {
        console.error('Error loading gacha data:', e);
      }
    } catch (e) {
      console.error('Error loading profile:', e);
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
  const defaultStats = { 
    totalRated: 0, 
    likedCount: 0, 
    cardsCount: cardsCount, 
    foldersCount: 0 
  };

  const stats = user ? {
    ...user.stats,
    cardsCount: cardsCount || user.stats.cardsCount,
  } : defaultStats;

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['#121212', '#1E1E1E', '#121212']}
        style={StyleSheet.absoluteFill}
      />
      <SafeAreaView style={[styles.safeArea, { paddingTop: top }]}>
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          refreshControl={
            <RefreshControl 
              tintColor="#fff" 
              refreshing={refreshing} 
              onRefresh={onRefresh}
              colors={['#6200EE']}
              progressBackgroundColor="#1E1E1E"
            />
          }
        >
          <ProfileHeader 
            username={user ? user.username : "Loading..."}
            profileImageURL={user ? user.avatarUrl : ""}
            isDonator={user ? user.isDonator : false}
            coins={coins}
            shards={shards}
          />
          
          <CollectionStats 
            stats={stats}
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#121212',
  },
  safeArea: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 100,
  },
});
