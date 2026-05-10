import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { SettingsScreenLayout } from '../../components/setting/SettingsScreenLayout';
import { AchievementsGallery } from '../../components/achievements/Achievements';
import {
  achievementService,
  AchievementWithProgress,
} from '../../libs/services/achievements/achievement-service';
import { Spacing } from '../../constants/DesignSystem';

export default function AchievementsScreen() {
  const [items, setItems] = useState<AchievementWithProgress[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    const unsubscribe = achievementService.subscribe(setItems);
    achievementService.list().then(setItems).catch(console.error);
    return unsubscribe;
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      const list = await achievementService.list();
      setItems(list);
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <SettingsScreenLayout title="Achievements" refreshing={refreshing} onRefresh={onRefresh}>
      <View style={{ paddingBottom: Spacing.xxl }}>
        <AchievementsGallery achievements={items} />
      </View>
    </SettingsScreenLayout>
  );
}
