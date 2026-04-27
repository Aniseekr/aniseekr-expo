import { View, Text, Pressable, Image, Platform, StyleSheet } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Anime } from '../rate/types';
import { useRouter } from 'expo-router';
import { useState, useEffect } from 'react';
import { animeNotificationService } from '../../modules/notifications/animeNotificationService';
import { NearbyPilgrimageBadge } from '../pilgrimage/NearbyPilgrimageBadge';
import { Colors, FontFamily, Radius, Spacing, Typography } from '../../constants/DesignSystem';

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

export function AnimeRowCard({
  anime,
  bangumiId,
}: {
  anime: Anime;
  bangumiId?: number;
}) {
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

                    {bangumiId !== undefined && (
                        <View style={{ marginTop: 4, marginBottom: 4 }}>
                            <NearbyPilgrimageBadge bangumiId={bangumiId} variant="pill" />
                        </View>
                    )}

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
                                color={isScheduled ? Colors.primary : Colors.text.primary}
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
        ...Typography.headlineSmall,
        color: Colors.text.primary,
        fontFamily: FontFamily.rounded,
        marginBottom: Spacing.md,
        paddingLeft: Spacing.xs,
    },
    cardPressable: {
        marginBottom: Spacing.md,
        ...Platform.select({
            ios: {
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.18,
                shadowRadius: 8,
            },
            android: { elevation: 2 },
        }),
    },
    cardContainer: {
        backgroundColor: Colors.glass.dark,
        borderRadius: Radius.card,
        padding: Spacing.md,
        flexDirection: 'row',
        borderWidth: 1,
        borderColor: Colors.glass.border,
    },
    cardImage: {
        width: 96,
        height: 144,
        borderRadius: Radius.md,
        borderWidth: 1,
        borderColor: Colors.glass.border,
    },
    cardTitle: {
        ...Typography.headlineSmall,
        color: Colors.text.primary,
        fontFamily: FontFamily.rounded,
        marginBottom: Spacing.xs,
    },
    tagContainer: {
        paddingHorizontal: Spacing.sm,
        paddingVertical: 5,
        backgroundColor: Colors.glass.medium,
        borderRadius: Radius.chip,
        borderWidth: 1,
        borderColor: Colors.glass.border,
    },
    tagText: {
        ...Typography.captionSmall,
        color: Colors.text.secondary,
        textTransform: 'uppercase',
        letterSpacing: 1,
    },
    remindButton: {
        flexDirection: 'row',
        alignItems: 'center',
        alignSelf: 'flex-start',
        paddingHorizontal: Spacing.md,
        paddingVertical: Spacing.xs + 2,
        backgroundColor: Colors.glass.medium,
        borderRadius: Radius.full,
        borderWidth: 1,
        borderColor: Colors.glass.border,
    },
    remindButtonActive: {
        backgroundColor: 'rgba(255, 159, 10, 0.18)',
        borderColor: Colors.primary,
    },
    remindButtonText: {
        ...Typography.captionSmall,
        color: Colors.text.primary,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    remindButtonTextActive: {
        color: Colors.primary,
    },
});
