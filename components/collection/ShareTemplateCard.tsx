import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Spacing, Typography } from '../../constants/DesignSystem';
import { useTheme } from '../../context/ThemeContext';
import { hapticsBridge } from '../../modules/haptics/hapticsBridge';
import type { ShareTemplate } from '../../libs/services/collection/share-templates';

interface ShareTemplateCardProps {
  template: ShareTemplate;
  active?: boolean;
  onSelect: (template: ShareTemplate) => void;
}

function ShareTemplateCardComponent({ template, active, onSelect }: ShareTemplateCardProps) {
  const { theme } = useTheme();

  return (
    <Pressable
      onPress={() => {
        hapticsBridge.selection();
        onSelect(template);
      }}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: active ? theme.accent : theme.background.secondary,
          borderColor: active ? theme.accent : theme.glassBorder,
          opacity: pressed ? 0.85 : 1,
        },
      ]}>
      <View style={styles.row}>
        <Text style={styles.emoji}>{template.emoji}</Text>
        <View style={styles.copy}>
          <Text style={[styles.title, { color: active ? '#0E0A06' : theme.text.primary }]}>
            {template.title}
          </Text>
          <Text
            style={[
              styles.description,
              { color: active ? 'rgba(14,10,6,0.7)' : theme.text.secondary },
            ]}
            numberOfLines={2}>
            {template.description}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    width: 200,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 18,
    borderWidth: 1,
    marginRight: Spacing.xs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  emoji: {
    fontSize: 24,
  },
  copy: {
    flex: 1,
  },
  title: {
    ...Typography.titleSmall,
    fontWeight: '700',
  },
  description: {
    ...Typography.captionSmall,
    marginTop: 2,
  },
});

export const ShareTemplateCard = memo(ShareTemplateCardComponent);
