import { View, Text, ScrollView, Pressable, Switch } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { GlassCard } from '../../components/common/GlassCard';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';

export default function SettingsScreen() {
  const { top } = useSafeAreaInsets();
  const [dataSaver, setDataSaver] = useState(false);
  const [notifications, setNotifications] = useState(true);

  return (
    <View className="flex-1 bg-bg-dark">
      <LinearGradient
        colors={['#1a1b2e', '#13131f', '#0f0f16']}
        className="absolute inset-0"
      />
      <SafeAreaView style={{ paddingTop: top }} className="flex-1">
        <View className="px-4 py-2 flex-row items-center">
            <Pressable onPress={() => router.back()} className="p-2 mr-2 bg-white/10 rounded-full">
                <Ionicons name="arrow-back" size={24} color="white" />
            </Pressable>
            <Text className="text-white text-2xl font-bold">Settings</Text>
        </View>

        <ScrollView className="flex-1 px-4 mt-4" contentContainerStyle={{ paddingBottom: 100, gap: 20 }}>
            
            {/* General */}
            <View>
                <Text className="text-white/60 text-sm uppercase font-semibold mb-3 ml-1">General</Text>
                <GlassCard variant="frosted" className="p-0">
                    <SettingItem label="Profile" icon="person-outline" onPress={() => {}} />
                    <SettingItem label="Language" icon="language-outline" value="English" onPress={() => {}} />
                </GlassCard>
            </View>

            {/* Sync & Data */}
            <View>
                <Text className="text-white/60 text-sm uppercase font-semibold mb-3 ml-1">Sync & Data</Text>
                <GlassCard variant="frosted" className="p-0">
                    <SettingItem label="Sync Now" icon="sync-outline" onPress={() => {}} />
                    <SettingItem label="Backup" icon="cloud-upload-outline" onPress={() => {}} />
                    <View className="flex-row items-center justify-between p-4 border-t border-white/5">
                        <View className="flex-row items-center gap-3">
                            <Ionicons name="cellular-outline" size={22} color="white" />
                            <Text className="text-white text-base">Data Saver</Text>
                        </View>
                        <Switch 
                            value={dataSaver} 
                            onValueChange={setDataSaver}
                            trackColor={{ false: '#333', true: '#6366f1' }}
                            thumbColor="white"
                        />
                    </View>
                </GlassCard>
            </View>

             {/* Otaku DNA */}
             <View>
                <Text className="text-white/60 text-sm uppercase font-semibold mb-3 ml-1">Otaku DNA</Text>
                <GlassCard variant="frosted" className="p-0">
                    <SettingItem label="DNA Analysis" icon="finger-print-outline" onPress={() => {}} />
                </GlassCard>
            </View>

            {/* About */}
            <View>
                <Text className="text-white/60 text-sm uppercase font-semibold mb-3 ml-1">App</Text>
                <GlassCard variant="frosted" className="p-0">
                    <SettingItem label="About" icon="information-circle-outline" onPress={() => {}} />
                    <SettingItem label="Help & Support" icon="help-circle-outline" onPress={() => {}} />
                    <SettingItem label="Log Out" icon="log-out-outline" color="#ef4444" onPress={() => {}} />
                </GlassCard>
            </View>

            <Text className="text-white/30 text-center text-xs mt-4">Aniseekr v1.0.0 (Expo)</Text>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

function SettingItem({ 
    label, 
    icon, 
    value, 
    color = "white", 
    onPress 
}: { 
    label: string, 
    icon: keyof typeof Ionicons.glyphMap, 
    value?: string, 
    color?: string,
    onPress: () => void 
}) {
    return (
        <Pressable 
            onPress={onPress}
            className="flex-row items-center justify-between p-4 active:bg-white/5" 
            style={({ pressed }) => [
                pressed && { backgroundColor: 'rgba(255,255,255,0.05)' }
            ]}
        >
            <View className="flex-row items-center gap-3">
                <Ionicons name={icon} size={22} color={color} />
                <Text style={{ color }} className="text-base">{label}</Text>
            </View>
            <View className="flex-row items-center gap-2">
                {value && <Text className="text-white/50 text-sm">{value}</Text>}
                <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.3)" />
            </View>
        </Pressable>
    );
}
