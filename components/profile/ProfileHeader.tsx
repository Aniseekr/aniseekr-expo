import { View, Text, Image, Pressable, Platform, StyleSheet } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import FontAwesome5 from '@expo/vector-icons/FontAwesome5';

interface ProfileHeaderProps {
  username: string;
  profileImageURL: string;
  isDonator: boolean;
  coins?: number;
  shards?: number;
}

export function ProfileHeader({ username, profileImageURL, isDonator, coins = 0, shards = 0 }: ProfileHeaderProps) {
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
              <Ionicons name="person" size={64} color="rgba(255,255,255,0.3)" />
            </View>
          )}
        </View>
        
        <View style={styles.nameRow}>
          <Text style={styles.username}>{username}</Text>
          {isDonator && (
            <View style={styles.vipBadge}>
              <FontAwesome5 name="crown" size={12} color="#000" />
              <Text style={styles.vipText}>VIP</Text>
            </View>
          )}
        </View>

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

        <View style={styles.socialRow}>
          <SocialLink 
            icon={<Ionicons name="logo-github" size={24} color="#fff" />} 
            backgroundColor="#1f2937"
            onPress={() => {}}
          />
          <SocialLink 
            icon={<Ionicons name="logo-twitter" size={24} color="#fff" />} 
            backgroundColor="#0ea5e9"
            onPress={() => {}}
          />
          <SocialLink 
            icon={<Ionicons name="mail" size={24} color="#fff" />} 
            backgroundColor="#a855f7"
            onPress={() => {}}
          />
        </View>
      </View>
    </View>
  );
}

function SocialLink({ icon, backgroundColor, onPress }: { icon: any, backgroundColor: string, onPress: () => void }) {
  return (
    <Pressable 
      onPress={onPress}
      style={[styles.socialButton, { backgroundColor }]}
    >
      {icon}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 32,
    padding: 32,
    marginHorizontal: 20,
    marginTop: 20,
    marginBottom: 32,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
      },
      android: {
        backgroundColor: '#1E1E1E',
        elevation: 4,
      },
    }),
  },
  backgroundBlur: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 128,
    height: 128,
    backgroundColor: 'rgba(59, 130, 246, 0.2)',
    borderRadius: 64,
    opacity: 0.5,
  },
  content: {
    alignItems: 'center',
    paddingVertical: 16,
  },
  avatarContainer: {
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
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
    gap: 12,
    marginBottom: 16,
  },
  username: {
    color: 'rgba(255, 255, 255, 0.87)',
    fontSize: 32,
    fontWeight: '700',
    letterSpacing: -0.5,
    fontFamily: Platform.select({
      ios: 'System',
      android: 'Roboto',
    }),
  },
  vipBadge: {
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
  vipText: {
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
    gap: 16,
    marginBottom: 24,
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  currencyItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  currencyText: {
    color: 'rgba(255, 255, 255, 0.87)',
    fontSize: 16,
    fontWeight: '600',
    fontFamily: Platform.select({
      ios: 'System',
      android: 'Roboto',
    }),
  },
  currencyDivider: {
    width: 1,
    height: 24,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  socialRow: {
    flexDirection: 'row',
    gap: 20,
  },
  socialButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      android: {
        elevation: 2,
      },
    }),
  },
});
