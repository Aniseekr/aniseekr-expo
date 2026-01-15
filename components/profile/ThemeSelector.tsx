import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import Animated, { useSharedValue } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';

export type ThemeType = 'dark' | 'light' | 'midnight' | 'sunset' | 'ocean' | 'forest' | 'candy';

interface Theme {
  id: ThemeType;
  name: string;
  color: string;
}

interface ThemeSelectorProps {
  currentTheme: ThemeType;
  onThemeChange: (theme: ThemeType) => void;
}

const THEMES: Theme[] = [
  { id: 'dark', name: 'Dark', color: '#1a1a1a' },
  { id: 'light', name: 'Light', color: '#f5f5f5' },
  { id: 'midnight', name: 'Midnight', color: '#0d0d1d' },
  { id: 'sunset', name: 'Sunset', color: '#ffa500' },
  { id: 'ocean', name: 'Ocean', color: '#06b6d4' },
  { id: 'forest', name: 'Forest', color: '#10b981' },
  { id: 'candy', name: 'Candy', color: '#f472b6' },
];

export function ThemeSelector({ currentTheme, onThemeChange }: ThemeSelectorProps) {
  const [visible, setVisible] = useState(false);

  const toggleVisibility = () => {
    setVisible(!visible);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const handleThemeSelect = (theme: Theme) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onThemeChange(theme);
    toggleVisibility();
  };

  const renderThemeOption = (theme: Theme) => {
    const isSelected = theme.id === currentTheme;

    return (
      <TouchableOpacity
        key={theme.id}
        style={[styles.themeOption, isSelected && styles.themeOptionSelected]}
        onPress={() => handleThemeSelect(theme)}
        activeOpacity={0.9}>
        <View style={[styles.themePreview, { backgroundColor: theme.color }]}>
          <Text style={[styles.themeName, isSelected && styles.themeNameSelected]}>
            {theme.name}
          </Text>
          {isSelected && (
            <View style={styles.checkmark}>
              <Text style={styles.checkmarkText}>✓</Text>
            </View>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  if (!visible) return null;

  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.toggleButton} onPress={toggleVisibility}>
        <Text style={styles.toggleButtonText}>Select Theme</Text>
      </TouchableOpacity>

      {THEMES.map(renderThemeOption)}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.95)',
  },

  toggleButton: {
    backgroundColor: '#fbbf24',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 28,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },

  toggleButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },

  themeOption: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 12,
    padding: 16,
    margin: 8,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.3)',
    alignItems: 'center',
  },

  themeOptionSelected: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderWidth: 2,
    borderColor: '#fff',
  },

  themePreview: {
    width: 100,
    height: 100,
    borderRadius: 50,
    marginBottom: 12,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },

  themeName: {
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
    color: '#fff',
  },

  themeNameSelected: {
    color: '#fff',
  },

  checkmark: {
    position: 'absolute',
    top: 8,
    right: 8,
    fontSize: 14,
    color: '#fff',
    fontWeight: 'bold',
  },

  checkmarkText: {
    color: '#fff',
  },
});
