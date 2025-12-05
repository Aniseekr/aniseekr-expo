import { useCallback, useMemo, useState } from "react";
import { FlatList, Modal, Pressable, RefreshControl, ScrollView, Text, View, Platform, StyleSheet } from "react-native";
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
import Ionicons from '@expo/vector-icons/Ionicons';

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
    () => (mode: ViewMode) => {
      const isActive = state.viewMode === mode;
      return (
        <Pressable
          key={mode}
          onPress={() => actions.setViewMode(mode)}
          style={[
            styles.tabButton,
            isActive && styles.tabButtonActive,
            Platform.OS === 'ios' && styles.tabButtonIOS,
          ]}
          className={`flex-1 py-3 rounded-2xl ${isActive ? "bg-white" : "bg-white/10"}`}
        >
          <Text
            style={[
              styles.tabButtonText,
              isActive && styles.tabButtonTextActive,
            ]}
            className={`text-center text-base font-semibold ${
              isActive ? "text-black" : "text-white/70"
            }`}
          >
            {mode === "discovery" ? "Discovery" : mode === "tracking" ? "Tracking" : "Trend"}
          </Text>
        </Pressable>
      );
    },
    [actions, state.viewMode]
  );

  const apiStatus = useMemo(() => {
    if (state.queueSize <= 0 && !state.nextAvailableAt) return null;
    const remaining = state.nextAvailableAt
      ? Math.max(0, state.nextAvailableAt.getTime() - Date.now()) / 1000
      : null;
    return (
      <View style={styles.statusCard} className="flex-row items-center gap-3 px-3 py-2 rounded-xl bg-white/10 border border-card-border">
        {remaining !== null ? (
          <Text style={styles.statusText} className="text-white/80 text-xs">Next request in {remaining.toFixed(1)}s</Text>
        ) : null}
        {state.queueSize > 0 ? <Text style={styles.statusText} className="text-white/80 text-xs">Queue: {state.queueSize}</Text> : null}
      </View>
    );
  }, [state.nextAvailableAt, state.queueSize]);

  const discoveryContent = (
    <View className="gap-4">
      {state.availableGenres.length === 0 ? (
        <View className="py-12 items-center">
          <Text style={styles.loadingText} className="text-white/80">Loading genres...</Text>
        </View>
      ) : listMode ? (
        <View>
          {state.availableGenres.map((item) => (
            <View key={item.id} className="mb-4">
              <GenreCard title={item.displayName} image={item.image} genreId={item.id} />
            </View>
          ))}
        </View>
      ) : (
        <View style={{ minHeight: 450 }}>
          <GenreCarousel data={state.availableGenres} />
        </View>
      )}
    </View>
  );

  const handleDiscoveryModeChange = useCallback((key: string) => {
    actions.setDiscoveryMode(key as "genres" | "mood" | "duration");
  }, [actions]);

  const trackingContent = (
    <View className="gap-6">
      {state.recommendations.length > 0 ? (
        <PersonalizedRecommendation data={state.recommendations} onRefresh={actions.loadRecommendations} />
      ) : null}
      <TrackingSelector value={state.discoveryMode} onChange={handleDiscoveryModeChange} />
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
      contentContainerStyle={{ paddingVertical: 12, paddingHorizontal: 16, paddingBottom: 100 }}
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

  const darkBg = Platform.OS === 'ios' ? "#000000" : "#121212"; // Material Design dark surface

  return (
    <SafeAreaView style={{ paddingTop: top, backgroundColor: darkBg }} className="flex-1">
      <Modal 
        visible={showDisplaySettings} 
        transparent 
        animationType={Platform.OS === 'ios' ? 'slide' : 'fade'} 
        onRequestClose={() => setShowDisplaySettings(false)}
      >
        <Pressable className="flex-1 bg-black/60" onPress={() => setShowDisplaySettings(false)}>
          <View style={styles.modalContent} className="mt-auto bg-card-surface border-t border-card-border rounded-t-3xl p-5">
            <Text style={styles.modalTitle} className="text-white text-lg font-semibold mb-2">Image Display Settings</Text>
            <Text style={styles.modalText} className="text-white/70 text-sm">
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
        style={{ backgroundColor: darkBg }}
        contentContainerStyle={{ padding: 16, gap: 18, paddingBottom: 120, backgroundColor: darkBg }}
        refreshControl={<RefreshControl tintColor={Platform.OS === 'ios' ? "#fff" : "#6200EE"} refreshing={false} onRefresh={handlePullAI} />}
      >
        <View className="gap-4">
          <View className="flex-row justify-end gap-3">
            <Pressable
              onPress={() => setListMode((v) => !v)}
              style={styles.iconButton}
              className="w-10 h-10 rounded-full items-center justify-center bg-white/10 border border-card-border"
            >
              <Ionicons 
                name={listMode ? "grid" : "list"} 
                size={20} 
                color="#fff" 
              />
            </Pressable>
            <Pressable
              onPress={() => setShowDisplaySettings(true)}
              style={styles.iconButton}
              className="w-10 h-10 rounded-full items-center justify-center bg-white/10 border border-card-border"
            >
              <Ionicons name="settings-outline" size={20} color="#fff" />
            </Pressable>
          </View>

          <View className="flex-row gap-3">{["discovery", "tracking", "trend"].map((m) => headerToggle(m as ViewMode))}</View>
        </View>
        {apiStatus}

        {state.viewMode === "trend" ? (
          trendContent
        ) : state.viewMode === "tracking" ? (
          trackingContent
        ) : (
          discoveryContent
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// Material Design styles with iOS compatibility
const styles = StyleSheet.create({
  tabButton: {
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  tabButtonActive: {
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 8,
      },
      android: {
        elevation: 4,
      },
    }),
  },
  tabButtonIOS: {
    // iOS-specific styling
  },
  tabButtonText: {
    fontFamily: Platform.select({
      ios: 'System',
      android: 'Roboto',
    }),
  },
  tabButtonTextActive: {
    fontWeight: '600',
  },
  statusCard: {
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  statusText: {
    fontFamily: Platform.select({
      ios: 'System',
      android: 'Roboto',
    }),
  },
  iconButton: {
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 3,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  loadingText: {
    fontFamily: Platform.select({
      ios: 'System',
      android: 'Roboto',
    }),
  },
  modalContent: {
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.3,
        shadowRadius: 12,
      },
      android: {
        elevation: 8,
      },
    }),
  },
  modalTitle: {
    fontFamily: Platform.select({
      ios: 'System',
      android: 'Roboto',
    }),
    fontWeight: '600',
  },
  modalText: {
    fontFamily: Platform.select({
      ios: 'System',
      android: 'Roboto',
    }),
  },
});

