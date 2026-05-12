import { View, Text, ScrollView, Platform, StyleSheet } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import FontAwesome5 from '@expo/vector-icons/FontAwesome5';
import { Colors, Radius, Spacing, Typography } from '../../constants/DesignSystem';
import type {
  FontAwesome5Name,
  IoniconsName,
  MaterialIconsName,
} from '../../libs/utils/icon-types';

type AccountStatCardProps =
  | { iconSet: 'Ionicons'; icon: IoniconsName; title: string; value: string; color: string }
  | { iconSet: 'MaterialIcons'; icon: MaterialIconsName; title: string; value: string; color: string }
  | { iconSet: 'FontAwesome5'; icon: FontAwesome5Name; title: string; value: string; color: string };

function AccountStatCard(props: AccountStatCardProps) {
  const { title, value, color } = props;
  return (
    <View style={styles.statCard}>
      <View style={[styles.iconContainer, { backgroundColor: `${color}20` }]}>
        {props.iconSet === 'Ionicons' ? (
          <Ionicons name={props.icon} size={28} color={color} />
        ) : props.iconSet === 'MaterialIcons' ? (
          <MaterialIcons name={props.icon} size={28} color={color} />
        ) : (
          <FontAwesome5 name={props.icon} size={28} color={color} />
        )}
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
  };
}

export function CollectionStats({ stats }: CollectionStatsProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.sectionTitle}>Overview</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}>
        <AccountStatCard
          title="Rated"
          value={stats.totalRated.toString()}
          icon="star"
          iconSet="Ionicons"
          color={Colors.warning}
        />
        <AccountStatCard
          title="Liked"
          value={stats.likedCount.toString()}
          icon="heart"
          iconSet="Ionicons"
          color={Colors.error}
        />
        <AccountStatCard
          title="Cards"
          value={stats.cardsCount.toString()}
          icon="collections"
          iconSet="MaterialIcons"
          color={Colors.info}
        />
        <AccountStatCard
          title="Folders"
          value={stats.foldersCount.toString()}
          icon="folder"
          iconSet="Ionicons"
          color={Colors.success}
        />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: Spacing.xxxl,
  },
  sectionTitle: {
    color: Colors.text.primary,
    ...Typography.headlineSmall,
    marginBottom: Spacing.lg,
    paddingHorizontal: Spacing.screenPadding,
    letterSpacing: -0.5,
    fontFamily: Platform.select({
      ios: 'System',
      android: 'Roboto',
    }),
  },
  scrollContent: {
    paddingLeft: Spacing.screenPadding,
    paddingRight: 4,
  },
  statCard: {
    width: 140,
    height: 170,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xl,
    marginRight: Spacing.md,
    backgroundColor: Colors.glass.medium,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.glass.border,
    ...Platform.select({
      android: {
        backgroundColor: Colors.background.secondary,
        elevation: 2,
      },
    }),
  },
  iconContainer: {
    width: 56,
    height: 56,
    borderRadius: Radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.glass.border,
  },
  value: {
    color: Colors.text.primary,
    ...Typography.headlineLarge,
    marginBottom: 4,
    letterSpacing: -0.5,
    fontFamily: Platform.select({
      ios: 'System',
      android: 'Roboto',
    }),
  },
  title: {
    color: Colors.text.placeholder,
    ...Typography.caption,
    textTransform: 'uppercase',
    letterSpacing: 2,
    fontFamily: Platform.select({
      ios: 'System',
      android: 'Roboto',
    }),
  },
});
