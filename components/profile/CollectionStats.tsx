import { View, Text, ScrollView, Platform, StyleSheet } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import FontAwesome5 from '@expo/vector-icons/FontAwesome5';

interface AccountStatCardProps {
  title: string;
  value: string;
  icon: any;
  iconSet: 'Ionicons' | 'MaterialIcons' | 'FontAwesome5';
  color: string;
}

function AccountStatCard({ title, value, icon, iconSet, color }: AccountStatCardProps) {
  const IconComponent = iconSet === 'Ionicons' ? Ionicons : iconSet === 'MaterialIcons' ? MaterialIcons : FontAwesome5;
  return (
    <View style={styles.statCard}>
      <View style={[styles.iconContainer, { backgroundColor: `${color}20` }]}>
        <IconComponent name={icon} size={28} color={color} />
      </View>
      <Text style={styles.value}>{value}</Text>
      <Text style={styles.title}>{title}</Text>
    </View>
  );
}

interface CollectionStatsProps {
    stats: {
        totalRated: number;
        likedCount: number;
        cardsCount: number;
        foldersCount: number;
    }
}

export function CollectionStats({ stats }: CollectionStatsProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.sectionTitle}>Overview</Text>
      <ScrollView 
        horizontal 
        showsHorizontalScrollIndicator={false} 
        contentContainerStyle={styles.scrollContent}
      >
        <AccountStatCard 
          title="Rated" 
          value={stats.totalRated.toString()} 
          icon="star" 
          iconSet="Ionicons" 
          color="#fbbf24" 
        />
        <AccountStatCard 
          title="Liked" 
          value={stats.likedCount.toString()} 
          icon="heart" 
          iconSet="Ionicons" 
          color="#ef4444" 
        />
        <AccountStatCard 
          title="Cards" 
          value={stats.cardsCount.toString()} 
          icon="collections" 
          iconSet="MaterialIcons" 
          color="#3b82f6" 
        />
        <AccountStatCard 
          title="Folders" 
          value={stats.foldersCount.toString()} 
          icon="folder" 
          iconSet="Ionicons" 
          color="#10b981" 
        />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 40,
  },
  sectionTitle: {
    color: 'rgba(255, 255, 255, 0.87)',
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 20,
    paddingHorizontal: 20,
    letterSpacing: -0.5,
    fontFamily: Platform.select({
      ios: 'System',
      android: 'Roboto',
    }),
  },
  scrollContent: {
    paddingLeft: 20,
    paddingRight: 4,
  },
  statCard: {
    width: 140,
    height: 170,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    marginRight: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    ...Platform.select({
      android: {
        backgroundColor: '#1E1E1E',
        elevation: 2,
      },
    }),
  },
  iconContainer: {
    width: 56,
    height: 56,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  value: {
    color: 'rgba(255, 255, 255, 0.87)',
    fontSize: 28,
    fontWeight: '700',
    marginBottom: 4,
    letterSpacing: -0.5,
    fontFamily: Platform.select({
      ios: 'System',
      android: 'Roboto',
    }),
  },
  title: {
    color: 'rgba(255, 255, 255, 0.4)',
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 2,
    fontFamily: Platform.select({
      ios: 'System',
      android: 'Roboto',
    }),
  },
});
