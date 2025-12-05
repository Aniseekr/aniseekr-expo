import { Stack } from "expo-router";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { View } from "react-native";

export default function RateLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <View className="flex-1 bg-bg-dark">
        <Stack screenOptions={{ headerShown: false }} />
      </View>
    </GestureHandlerRootView>
  );
}

