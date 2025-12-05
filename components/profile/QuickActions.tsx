import { View, Text, Pressable, Platform, StyleSheet } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import FontAwesome5 from '@expo/vector-icons/FontAwesome5';

interface QuickActionButtonProps {
  icon: any;
  iconSet: 'Ionicons' | 'MaterialIcons' | 'FontAwesome5';
  title: string;
  color: string;
  onPress: () => void;
}

function QuickActionButton({ icon, iconSet, title, color, onPress }: QuickActionButtonProps) {
  const IconComponent = iconSet === 'Ionicons' ? Ionicons : iconSet === 'MaterialIcons' ? MaterialIcons : FontAwesome5;
  return (
    <Pressable onPress={onPress} style={styles.actionButton}>
      <View style={[styles.iconContainer, { backgroundColor: `${color}20` }]}>
        <IconComponent name={icon} size={28} color={color} />
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
    }
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
            color="#fbbf24" 
            onPress={actions.onPremium} 
          />
          <QuickActionButton 
            icon="sync" 
            iconSet="Ionicons" 
            title="Sync" 
            color="#3b82f6" 
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
            color="#06b6d4" 
            onPress={actions.onBackup} 
          />
          <QuickActionButton 
            icon="dna" 
            iconSet="Ionicons" 
            title="Otaku DNA" 
            color="#a855f7" 
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
  card: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 32,
    padding: 32,
    marginHorizontal: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    ...Platform.select({
      android: {
        backgroundColor: '#1E1E1E',
        elevation: 4,
      },
    }),
  },
  actionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 32,
  },
  actionButton: {
    alignItems: 'center',
    flex: 1,
  },
  iconContainer: {
    width: 64,
    height: 64,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    ...Platform.select({
      android: {
        elevation: 2,
      },
    }),
  },
  actionLabel: {
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: 10,
    fontWeight: '700',
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
