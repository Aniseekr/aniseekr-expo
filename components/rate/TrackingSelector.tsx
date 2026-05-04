import { memo } from 'react';
import { Pressable, Text, View, Platform, StyleSheet } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

type Option = {
  key: string;
  icon: string;
  label: string;
  color: string;
};

type Props = {
  value: string;
  onChange: (key: string) => void;
};

const options: Option[] = [
  { key: 'genres', icon: 'local-offer', label: 'Genres', color: '#60a5fa' },
  { key: 'mood', icon: 'favorite', label: 'Mood', color: '#c084fc' },
  { key: 'duration', icon: 'schedule', label: 'Duration', color: '#4ade80' },
];

function TrackingSelectorComponent({ value, onChange }: Props) {
  return (
    <View style={styles.container}>
      <Text style={styles.label}>Find by</Text>
      <View style={styles.optionsRow}>
        {options.map((option) => {
          const selected = option.key === value;
          return (
            <Pressable
              key={option.key}
              onPress={() => onChange(option.key)}
              style={[
                styles.optionButton,
                selected && styles.optionButtonActive,
                selected && { borderColor: option.color },
              ]}>
              <MaterialIcons
                name={option.icon as any}
                size={18}
                color={selected ? option.color : 'rgba(255, 255, 255, 0.6)'}
              />
              <Text style={[styles.optionText, selected && { color: option.color }]}>
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 12,
  },
  label: {
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: 16,
    fontWeight: '600',
    paddingHorizontal: 4,
    fontFamily: Platform.select({
      ios: 'System',
      android: 'Roboto',
    }),
  },
  optionsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  optionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    ...Platform.select({
      android: {
        elevation: 1,
      },
    }),
  },
  optionButtonActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderWidth: 2,
    ...Platform.select({
      android: {
        elevation: 2,
      },
    }),
  },
  optionText: {
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: 14,
    fontWeight: '500',
    fontFamily: Platform.select({
      ios: 'System',
      android: 'Roboto',
    }),
  },
});

export const TrackingSelector = memo(TrackingSelectorComponent);
