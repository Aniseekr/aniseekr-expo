import { Pressable, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useTheme } from '../../../context/ThemeContext';
import { Radius, Spacing } from '../../../constants/DesignSystem';
import { ThemedText, readableTextOn } from '../../themed';
import { hapticsBridge } from '../../../modules/haptics/hapticsBridge';

export interface ExhibitCardProps {
  title: string;
  subtitle: string;
  icon: React.ComponentProps<typeof MaterialIcons>['name'];
  gradientFrom: string;
  gradientTo: string;
  featured?: boolean;
  onPress: () => void;
}

export function ExhibitCard({
  title,
  subtitle,
  icon,
  gradientFrom,
  gradientTo,
  featured,
  onPress,
}: ExhibitCardProps) {
  const { theme } = useTheme();
  const onAccent = readableTextOn(gradientFrom);

  return (
    <Pressable
      onPress={() => {
        hapticsBridge.tap();
        onPress();
      }}
      style={({ pressed }) => [styles.wrap, { opacity: pressed ? 0.85 : 1 }]}
    >
      <LinearGradient
        colors={[gradientFrom, gradientTo]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[
          styles.card,
          featured ? styles.featured : null,
          { borderColor: theme.glassBorder },
        ]}
      >
        <View style={[styles.iconWrap, { backgroundColor: `${onAccent}26` }]}>
          <MaterialIcons name={icon} size={featured ? 26 : 22} color={onAccent} />
        </View>
        <View style={styles.text}>
          <ThemedText
            variant={featured ? 'titleLarge' : 'titleMedium'}
            weight="700"
            style={{ color: onAccent }}
          >
            {title}
          </ThemedText>
          <ThemedText
            variant="bodySmall"
            style={{ color: `${onAccent}CC` }}
            numberOfLines={2}
          >
            {subtitle}
          </ThemedText>
        </View>
        <MaterialIcons name="chevron-right" size={20} color={onAccent} />
      </LinearGradient>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  card: {
    borderRadius: Radius.card,
    borderWidth: 1,
    padding: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    minHeight: 76,
  },
  featured: {
    minHeight: 110,
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    flex: 1,
    gap: 2,
  },
});
