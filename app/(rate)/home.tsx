import { useCallback, useMemo, useState } from "react";
import { FlatList, Modal, Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { GenreCarousel } from "../../components/rate/GenreCarousel";
import { GenreCard } from "../../components/rate/GenreCard";
import { PersonalizedRecommendation } from "../../components/rate/PersonalizedRecommendation";
import { PhotoCard } from "../../components/rate/PhotoCard";
import { TrackingSelector } from "../../components/rate/TrackingSelector";
import { TrendCard } from "../../components/rate/TrendCard";
import { AIRecommendationSheet } from "../../components/rate/AIRecommendationSheet";
import { useRateData } from "../../components/rate/useRateData";
import { Photo, ViewMode } from "../../components/rate/types";

const samplePhotos: Photo[] = [
  { id: "p1", url: "https://picsum.photos/seed/p1/720/1280", userId: "u1" },
  { id: "p2", url: "https://picsum.photos/seed/p2/720/1280", userId: "u2" },
  { id: "p3", url: "https://picsum.photos/seed/p3/720/1280", userId: "u3" },
];

export default function HomeRateScreen() {
  const { top } = useSafeAreaInsets();
  const { state, actions } = useRateData();
  const [listMode, setListMode] = useState(false);
  const [showAI, setShowAI] = useState(false);
  const [showDisplaySettings, setShowDisplaySettings] = useState(false);
  const [photos, setPhotos] = useState(samplePhotos);

  const onSwipe = useCallback(
    (direction: "left" | "right") => {
      setPhotos((prev) => prev.slice(1));
    },
    [setPhotos]
  );

  const headerToggle = useMemo(
    () => (mode: ViewMode) => (
      <Pressable
        key={mode}
        onPress={() => actions.setViewMode(mode)}
        className={`flex-1 py-3 rounded-2xl ${state.viewMode === mode ? "bg-white" : "bg-white/10"}`}
      >
        <Text
          className={`text-center text-base font-semibold ${
            state.viewMode === mode ? "text-black" : "text-white/70"
          }`}
        >
          {mode === "discovery" ? "Discovery" : mode === "tracking" ? "Tracking" : "Trend"}
        </Text>
      </Pressable>
    ),
    [actions, state.viewMode]
  );

  const apiStatus = useMemo(() => {
    if (state.queueSize <= 0 && !state.nextAvailableAt) return null;
    const remaining = state.nextAvailableAt
      ? Math.max(0, state.nextAvailableAt.getTime() - Date.now()) / 1000
      : null;
    return (
      <View className="flex-row items-center gap-3 px-3 py-2 rounded-xl bg-white/10 border border-card-border">
        {remaining !== null ? (
          <Text className="text-white/80 text-xs">Next request in {remaining.toFixed(1)}s</Text>
        ) : null}
        {state.queueSize > 0 ? <Text className="text-white/80 text-xs">Queue: {state.queueSize}</Text> : null}
      </View>
    );
  }, [state.nextAvailableAt, state.queueSize]);

  const discoveryContent = (
    <View className="gap-4">
      <View className="flex-row justify-end px-1">
        <Pressable
          onPress={() => setListMode((v) => !v)}
          className="w-10 h-10 rounded-full items-center justify-center bg-white/10 border border-card-border"
        >
          <Text className="text-white text-lg">{listMode ? "🌀" : "☰"}</Text>
        </Pressable>
      </View>
      {state.availableGenres.length === 0 ? (
        <View className="py-12 items-center">
          <Text className="text-white/80">Loading genres...</Text>
        </View>
      ) : listMode ? (
        <FlatList
          data={state.availableGenres}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <View className="mb-4">
              <GenreCard title={item.displayName} image={item.image} />
            </View>
          )}
          scrollEnabled={false}
          ItemSeparatorComponent={() => <View className="h-2" />}
        />
      ) : (
        <GenreCarousel data={state.availableGenres} />
      )}
    </View>
  );

  const trackingContent = (
    <View className="gap-6">
      {state.recommendations.length > 0 ? (
        <PersonalizedRecommendation data={state.recommendations} onRefresh={actions.loadRecommendations} />
      ) : null}
      <TrackingSelector value={state.discoveryMode} onChange={actions.setDiscoveryMode} />
      {state.discoveryMode === "genres" ? (
        discoveryContent
      ) : (
        <View className="rounded-2xl border border-card-border bg-card-surface p-4">
          <Text className="text-white text-lg font-semibold">
            {state.discoveryMode === "mood" ? "Pick mood" : "Pick duration"}
          </Text>
          <Text className="text-white/70 mt-2">
            Quick filters will appear here. Hook up to your data source to fetch results.
          </Text>
        </View>
      )}
    </View>
  );

  const trendContent = (
    <FlatList
      data={state.trendAnime}
      keyExtractor={(item) => item.id}
      renderItem={({ item, index }) => <TrendCard anime={item} rank={index + 1} />}
      ItemSeparatorComponent={() => <View className="h-3" />}
      contentContainerStyle={{ paddingVertical: 12, paddingHorizontal: 16 }}
      refreshControl={
        <RefreshControl
          tintColor="#fff"
          refreshing={false}
          onRefresh={() => {
            actions.loadTrend();
          }}
        />
      }
      ListEmptyComponent={
        <View className="py-12 items-center">
          <Text className="text-white/80">Loading trending...</Text>
        </View>
      }
    />
  );

  const handlePullAI = useCallback(async () => {
    setShowAI(true);
    await actions.loadAIRecommendation();
  }, [actions]);

  return (
    <SafeAreaView style={{ paddingTop: top }} className="flex-1 bg-bg-dark">
      <Modal visible={showDisplaySettings} transparent animationType="fade" onRequestClose={() => setShowDisplaySettings(false)}>
        <Pressable className="flex-1 bg-black/60" onPress={() => setShowDisplaySettings(false)}>
          <View className="mt-auto bg-card-surface border-t border-card-border rounded-t-3xl p-5">
            <Text className="text-white text-lg font-semibold mb-2">Image Display Settings</Text>
            <Text className="text-white/70 text-sm">
              Hook up your display preferences here (fit/fill/blur). Currently a placeholder to mirror the Swift sheet.
            </Text>
          </View>
        </Pressable>
      </Modal>

      <AIRecommendationSheet
        visible={showAI}
        data={state.aiRecommendation}
        onClose={() => setShowAI(false)}
        onSelect={() => setShowAI(false)}
      />

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ padding: 16, gap: 18, paddingBottom: 120 }}
        refreshControl={<RefreshControl tintColor="#fff" refreshing={false} onRefresh={handlePullAI} />}
      >
        <View className="gap-4">
          <View className="flex-row justify-end gap-3">
            <Pressable
              onPress={() => setListMode((v) => !v)}
              className="w-10 h-10 rounded-full items-center justify-center bg-white/10 border border-card-border"
            >
              <Text className="text-white text-lg">{listMode ? "🌀" : "☰"}</Text>
            </Pressable>
            <Pressable
              onPress={() => setShowDisplaySettings(true)}
              className="w-10 h-10 rounded-full items-center justify-center bg-white/10 border border-card-border"
            >
              <Text className="text-white text-lg">⚙️</Text>
            </Pressable>
          </View>

          <View className="flex-row gap-3">{["discovery", "tracking", "trend"].map((m) => headerToggle(m as ViewMode))}</View>
        </View>
        {apiStatus}

        {state.viewMode === "trend" ? (
          <View className="flex-1">{trendContent}</View>
        ) : state.viewMode === "tracking" ? (
          trackingContent
        ) : (
          discoveryContent
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

