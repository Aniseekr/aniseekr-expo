import { View, Text, Image, Platform, Pressable, StyleSheet } from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import Ionicons from '@expo/vector-icons/Ionicons';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import FontAwesome5 from '@expo/vector-icons/FontAwesome5';
import { Colors, Radius, Spacing, Typography } from '../../constants/DesignSystem';
import { hapticsBridge } from '../../modules/haptics/hapticsBridge';

interface ProfileHeaderProps {
  username: string;
  profileImageURL: string;
  isPro: boolean;
  coins?: number;
  shards?: number;
  editable?: boolean;
  onEditName?: () => void;
}

export function ProfileHeader({
  username,
  profileImageURL,
  isPro,
  coins = 0,
  shards = 0,
  editable = false,
  onEditName,
}: ProfileHeaderProps) {
  const handleEditPress = () => {
    hapticsBridge.tap();
    onEditName?.();
  };

  return (
    <View style={styles.container}>
      {/* Decorative background blur */}
      <View style={styles.backgroundBlur} />

      <View style={styles.content}>
        <View style={styles.avatarContainer}>
          {profileImageURL ? (
            <Image source={{ uri: profileImageURL }} style={styles.avatar} />
          ) : (
            <View style={styles.avatarPlaceholder}>
              <Ionicons name="person" size={64} color={Colors.text.disabled} />
            </View>
          )}
        </View>

        <Pressable
          onPress={editable ? handleEditPress : undefined}
          disabled={!editable}
          style={({ pressed }) => [styles.nameRow, pressed && editable && { opacity: 0.7 }]}>
          <Text style={styles.username}>{username}</Text>
          {editable ? <MaterialIcons name="edit" size={16} color={Colors.text.tertiary} /> : null}
          {isPro && (
            <View style={styles.proBadge}>
              <FontAwesome5 name="crown" size={12} color="#000" />
              <Text style={styles.proText}>PRO</Text>
            </View>
          )}
        </Pressable>

        {/* Currency display */}
        <View style={styles.currencyRow}>
          <View style={styles.currencyItem}>
            <MaterialIcons name="monetization-on" size={18} color="#fbbf24" />
            <Text style={styles.currencyText}>{coins}</Text>
          </View>
          <View style={styles.currencyDivider} />
          <View style={styles.currencyItem}>
            <MaterialIcons name="diamond" size={18} color="#06b6d4" />
            <Text style={styles.currencyText}>{shards}</Text>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.glass.medium,
    borderRadius: Radius.xxl,
    padding: Spacing.xxl,
    marginHorizontal: Spacing.screenPadding,
    marginTop: Spacing.lg,
    marginBottom: Spacing.xxl,
    borderWidth: 1,
    borderColor: Colors.glass.border,
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 12,
      },
      android: {
        backgroundColor: Colors.background.secondary,
        elevation: 8,
      },
    }),
  },
  backgroundBlur: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 128,
    height: 128,
    backgroundColor: `${Colors.secondary}33`,
    borderRadius: 64,
    opacity: 0.5,
  },
  content: {
    alignItems: 'center',
    paddingVertical: Spacing.md,
  },
  avatarContainer: {
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: Colors.glass.dark,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.xl,
    overflow: 'hidden',
    ...Platform.select({
      android: {
        elevation: 8,
      },
    }),
  },
  avatar: {
    width: '100%',
    height: '100%',
    borderRadius: 70,
  },
  avatarPlaceholder: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  username: {
    color: Colors.text.primary,
    ...Typography.headlineLarge,
    letterSpacing: -0.5,
    fontFamily: Platform.select({
      ios: 'System',
      android: 'Roboto',
    }),
  },
  proBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#fbbf24',
    borderRadius: 20,
    ...Platform.select({
      android: {
        elevation: 2,
      },
    }),
  },
  proText: {
    color: '#000',
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    fontFamily: Platform.select({
      ios: 'System',
      android: 'Roboto',
    }),
  },
  currencyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.glass.dark,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.glass.border,
  },
  currencyItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  currencyText: {
    color: Colors.text.primary,
    ...Typography.titleMedium,
    fontFamily: Platform.select({
      ios: 'System',
      android: 'Roboto',
    }),
  },
  currencyDivider: {
    width: 1,
    height: 24,
    backgroundColor: Colors.glass.border,
  },
});
