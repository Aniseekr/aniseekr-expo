import { View, Text, Pressable, Platform, StyleSheet } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import FontAwesome5 from '@expo/vector-icons/FontAwesome5';
import { Colors, Radius, Spacing, Typography } from '../../constants/DesignSystem';
import type {
  FontAwesome5Name,
  IoniconsName,
  MaterialIconsName,
} from '../../libs/utils/icon-types';

type QuickActionButtonProps = (
  | { iconSet: 'Ionicons'; icon: IoniconsName }
  | { iconSet: 'MaterialIcons'; icon: MaterialIconsName }
  | { iconSet: 'FontAwesome5'; icon: FontAwesome5Name }
) & { title: string; color: string; onPress: () => void };

function QuickActionButton(props: QuickActionButtonProps) {
  const { title, color, onPress } = props;
  return (
    <Pressable onPress={onPress} style={styles.actionButton}>
      <View style={[styles.iconContainer, { backgroundColor: `${color}20` }]}>
        {props.iconSet === 'Ionicons' ? (
          <Ionicons name={props.icon} size={28} color={color} />
        ) : props.iconSet === 'MaterialIcons' ? (
          <MaterialIcons name={props.icon} size={28} color={color} />
        ) : (
          <FontAwesome5 name={props.icon} size={28} color={color} />
        )}
      </View>
      <Text style={styles.actionLabel}>{title}</Text>
    </Pressable>
  );
}

interface QuickActionsProps {
  actions: {
    onPremium: () => void;
    onSync: () => void;
    onSettings: () => void;
    onBackup: () => void;
    onDNA: () => void;
  };
}

export function QuickActions({ actions }: QuickActionsProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.sectionTitle}>Quick Actions</Text>
      <View style={styles.card}>
        <View style={styles.actionsRow}>
          <QuickActionButton
            icon="diamond"
            iconSet="Ionicons"
            title="Premium"
            color={Colors.warning}
            onPress={actions.onPremium}
          />
          <QuickActionButton
            icon="sync"
            iconSet="Ionicons"
            title="Sync"
            color={Colors.info}
            onPress={actions.onSync}
          />
          <QuickActionButton
            icon="settings-sharp"
            iconSet="Ionicons"
            title="Settings"
            color="#9ca3af"
            onPress={actions.onSettings}
          />
        </View>
        <View style={styles.actionsRow}>
          <QuickActionButton
            icon="cloud-upload"
            iconSet="Ionicons"
            title="Backup"
            color={Colors.accent}
            onPress={actions.onBackup}
          />
          <QuickActionButton
            icon="dna"
            iconSet="FontAwesome5"
            title="Otaku DNA"
            color={Colors.secondary}
            onPress={actions.onDNA}
          />
          <View style={styles.spacer} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 80,
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
  card: {
    backgroundColor: Colors.glass.medium,
    borderRadius: Radius.xxl,
    padding: Spacing.xxl,
    marginHorizontal: Spacing.screenPadding,
    borderWidth: 1,
    borderColor: Colors.glass.border,
    ...Platform.select({
      android: {
        backgroundColor: Colors.background.secondary,
        elevation: 4,
      },
    }),
  },
  actionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: Spacing.xxl,
  },
  actionButton: {
    alignItems: 'center',
    flex: 1,
  },
  iconContainer: {
    width: 64,
    height: 64,
    borderRadius: Radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.glass.border,
    ...Platform.select({
      android: {
        elevation: 2,
      },
    }),
  },
  actionLabel: {
    color: Colors.text.secondary,
    ...Typography.caption,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    fontFamily: Platform.select({
      ios: 'System',
      android: 'Roboto',
    }),
  },
  spacer: {
    flex: 1,
  },
});
