import { Stack } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { View, StyleSheet } from 'react-native';
import { useTheme } from '../../../context/ThemeContext';

export default function RateLayout() {
  const { theme } = useTheme();
  return (
    <GestureHandlerRootView style={styles.container}>
      <View style={[styles.content, { backgroundColor: theme.background.primary }]}>
        <Stack
          screenOptions={{
            headerShown: false,
            animation: 'none', // Disable default animations to prevent jump
          }}
        />
      </View>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
  },
});
