import { View, Text, ScrollView, Pressable, Platform, StyleSheet } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { GlassCard } from '../common/GlassCard';

import { Anime } from '../rate/types';
import { useRouter } from 'expo-router';
import { Image } from 'react-native';

interface WeeklyCalendarProps {
    weekDays: string[];
    groupedAnime: any[]; // Using any for simplicity as types are shared, ideally would allow shared types
    isCurrentDay: (day: string) => boolean;
    dayShortName: (day: string) => string;
}

export function WeeklyCalendar({ weekDays, groupedAnime, isCurrentDay, dayShortName }: WeeklyCalendarProps) {
    const router = useRouter();
    const renderDayColumn = (day: string) => {
        const dayData = groupedAnime.find((d) => d.day === day) || { day, anime: [] };
        const isToday = isCurrentDay(day);
    
        return (
          <View 
            key={day} 
            style={[
              styles.dayColumn,
              isToday && styles.dayColumnToday
            ]}
          >
            <View className="mb-3">
              <Text style={[
                styles.dayTitle,
                isToday && styles.dayTitleToday
              ]}>
                {dayShortName(day)}
              </Text>
              <Text style={styles.dayCount}>{dayData.anime.length} shows</Text>
            </View>
            <ScrollView 
              showsVerticalScrollIndicator={false} 
              style={styles.animeScroll}
              contentContainerStyle={styles.animeScrollContent}
            >
              {dayData.anime.length === 0 ? (
                <View className="py-6 items-center">
                  <MaterialIcons name="tv-off" size={32} color="rgba(255, 255, 255, 0.2)" />
                  <Text style={styles.emptyText}>No Signal</Text>
                </View>
              ) : (
                <View className="gap-3">
                  {dayData.anime.map((anime: Anime) => (
                    <Pressable 
                      onPress={() => router.push(`/(rate)/anime/${anime.id}`)} 
                      key={anime.id} 
                      style={styles.animeCard}
                    >
                      <Image 
                        source={{ uri: anime.image }} 
                        style={styles.animeImage}
                        resizeMode="cover" 
                      />
                      <Text style={styles.animeTitle} numberOfLines={2}>
                        {anime.title}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              )}
            </ScrollView>
          </View>
        );
      };

    return (
        <View style={styles.container}>
          <ScrollView 
              horizontal 
              showsHorizontalScrollIndicator={false} 
              style={styles.horizontalScroll}
              contentContainerStyle={styles.scrollContent}
          >
              <View style={styles.daysContainer}>
                  {weekDays.map((day) => renderDayColumn(day))}
              </View>
          </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  horizontalScroll: {
    flex: 1,
  },
  scrollContent: {
    paddingLeft: 20,
    paddingRight: 20,
    paddingVertical: 8,
  },
  daysContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  dayColumn: {
    width: 160,
    padding: 16,
    marginRight: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    minHeight: 400,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
      },
      android: {
        backgroundColor: '#1E1E1E',
        elevation: 2,
      },
    }),
  },
  dayColumnToday: {
    backgroundColor: 'rgba(98, 0, 238, 0.12)',
    borderColor: 'rgba(98, 0, 238, 0.4)',
    borderWidth: 2,
    ...Platform.select({
      android: {
        backgroundColor: 'rgba(98, 0, 238, 0.15)',
        elevation: 4,
      },
    }),
  },
  dayTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 4,
    color: 'rgba(255, 255, 255, 0.87)',
    fontFamily: Platform.select({
      ios: 'System',
      android: 'Roboto',
    }),
  },
  dayTitleToday: {
    color: '#BB86FC',
  },
  dayCount: {
    color: 'rgba(255, 255, 255, 0.4)',
    fontSize: 11,
    fontWeight: '500',
    textTransform: 'uppercase',
    letterSpacing: 1,
    fontFamily: Platform.select({
      ios: 'System',
      android: 'Roboto',
    }),
  },
  animeScroll: {
    flex: 1,
    maxHeight: 500,
  },
  animeScrollContent: {
    paddingBottom: 8,
  },
  animeCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    ...Platform.select({
      android: {
        backgroundColor: 'rgba(30, 30, 30, 0.8)',
        elevation: 1,
      },
    }),
  },
  animeImage: {
    width: '100%',
    height: 96,
    borderRadius: 8,
    marginBottom: 8,
  },
  animeTitle: {
    color: 'rgba(255, 255, 255, 0.87)',
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 4,
    lineHeight: 16,
    fontFamily: Platform.select({
      ios: 'System',
      android: 'Roboto',
    }),
  },
  emptyText: {
    color: 'rgba(255, 255, 255, 0.2)',
    fontSize: 13,
    marginTop: 8,
    fontFamily: Platform.select({
      ios: 'System',
      android: 'Roboto',
    }),
  },
});
