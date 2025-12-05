import { View, Text, Pressable, Image, Platform, StyleSheet } from 'react-native';
import { GlassCard } from '../common/GlassCard';
import Ionicons from '@expo/vector-icons/Ionicons';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Anime } from '../rate/types';
import { useRouter } from 'expo-router';
import { useState, useEffect } from 'react';
import { animeNotificationService } from '../../modules/notifications/animeNotificationService';

interface AnimeListProps {
  listViewData: { day: string; anime: Anime[] }[];
  renderAnimeCard: (anime: Anime) => React.ReactNode;
}

export function AnimeList({ listViewData, renderAnimeCard }: AnimeListProps) {
  return (
    <View className="px-5">
      {listViewData.map((group) => (
        <View key={group.day} className="mb-8">
          <Text style={styles.sectionTitle}>{group.day}</Text>
          {group.anime.map((anime) => renderAnimeCard(anime))}
        </View>
      ))}
    </View>
  );
}

export function AnimeRowCard({ anime }: { anime: Anime }) {
    const router = useRouter();
    const [isScheduled, setIsScheduled] = useState(false);
    const [isLoading, setIsLoading] = useState(false);

    const handleRemindMe = async () => {
        if (isLoading) return;
        
        setIsLoading(true);
        try {
            if (isScheduled) {
                await animeNotificationService.cancelAnimeNotification(anime.id);
                setIsScheduled(false);
            } else {
                const notificationId = await animeNotificationService.scheduleAnimeNotification(anime);
                if (notificationId) {
                    setIsScheduled(true);
                }
            }
        } catch (error) {
            console.error('Error toggling notification:', error);
        } finally {
            setIsLoading(false);
        }
    };

    // Check if notification is scheduled on mount
    useEffect(() => {
        setIsScheduled(animeNotificationService.isAnimeScheduled(anime.id));
    }, [anime.id]);

    return (
        <Pressable 
            onPress={() => router.push(`/(rate)/anime/${anime.id}`)}
            style={styles.cardPressable}
        >
            <View style={styles.cardContainer}>
                <Image 
                    source={{ uri: anime.image }} 
                    style={styles.cardImage}
                    resizeMode="cover" 
                />
                <View className="flex-1 justify-center ml-4">
                    <Text style={styles.cardTitle} numberOfLines={2}>
                        {anime.title}
                    </Text>
                    
                    {anime.tags && anime.tags.length > 0 && (
                        <View className="flex-row flex-wrap gap-2 mb-4 mt-2">
                            {anime.tags.slice(0, 3).map((tag, idx) => (
                                <View key={idx} style={styles.tagContainer}>
                                    <Text style={styles.tagText}>{tag}</Text>
                                </View>
                            ))}
                        </View>
                    )}
                    
                    {anime.nextAiringEpisode && (
                        <Pressable 
                            onPress={(e) => {
                                e.stopPropagation();
                                handleRemindMe();
                            }}
                            style={[
                                styles.remindButton,
                                isScheduled && styles.remindButtonActive
                            ]}
                            disabled={isLoading}
                        >
                            <MaterialIcons 
                                name={isScheduled ? "notifications-active" : "notifications-none"} 
                                size={16} 
                                color={isScheduled ? "#6200EE" : "#fff"} 
                                style={{ marginRight: 6 }}
                            />
                            <Text style={[
                                styles.remindButtonText,
                                isScheduled && styles.remindButtonTextActive
                            ]}>
                                {isScheduled ? 'Scheduled' : 'Remind Me'}
                            </Text>
                        </Pressable>
                    )}
                </View>
            </View>
        </Pressable>
    );
}

const styles = StyleSheet.create({
    sectionTitle: {
        color: 'rgba(255, 255, 255, 0.87)',
        fontSize: 24,
        fontWeight: '700',
        marginBottom: 16,
        paddingLeft: 8,
        letterSpacing: -0.5,
        fontFamily: Platform.select({
            ios: 'System',
            android: 'Roboto',
        }),
    },
    cardPressable: {
        marginBottom: 16,
        ...Platform.select({
            ios: {
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.1,
                shadowRadius: 4,
            },
            android: {
                elevation: 2,
            },
        }),
    },
    cardContainer: {
        backgroundColor: 'rgba(255, 255, 255, 0.05)',
        borderRadius: 16,
        padding: 16,
        flexDirection: 'row',
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.1)',
        ...Platform.select({
            android: {
                backgroundColor: '#1E1E1E',
                elevation: 2,
            },
        }),
    },
    cardImage: {
        width: 96,
        height: 144,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.1)',
    },
    cardTitle: {
        color: 'rgba(255, 255, 255, 0.87)',
        fontSize: 18,
        fontWeight: '600',
        marginBottom: 8,
        lineHeight: 24,
        fontFamily: Platform.select({
            ios: 'System',
            android: 'Roboto',
        }),
    },
    tagContainer: {
        paddingHorizontal: 12,
        paddingVertical: 6,
        backgroundColor: 'rgba(255, 255, 255, 0.08)',
        borderRadius: 12,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.1)',
    },
    tagText: {
        color: 'rgba(255, 255, 255, 0.6)',
        fontSize: 10,
        fontWeight: '600',
        textTransform: 'uppercase',
        letterSpacing: 1,
        fontFamily: Platform.select({
            ios: 'System',
            android: 'Roboto',
        }),
    },
    remindButton: {
        flexDirection: 'row',
        alignItems: 'center',
        alignSelf: 'flex-start',
        paddingHorizontal: 20,
        paddingVertical: 10,
        backgroundColor: 'rgba(98, 0, 238, 0.12)',
        borderRadius: 20,
        borderWidth: 1,
        borderColor: 'rgba(98, 0, 238, 0.3)',
    },
    remindButtonActive: {
        backgroundColor: 'rgba(98, 0, 238, 0.2)',
        borderColor: 'rgba(98, 0, 238, 0.5)',
    },
    remindButtonText: {
        color: '#fff',
        fontSize: 12,
        fontWeight: '600',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        fontFamily: Platform.select({
            ios: 'System',
            android: 'Roboto',
        }),
    },
    remindButtonTextActive: {
        color: '#BB86FC',
    },
});
