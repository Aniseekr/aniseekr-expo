import { memo } from "react";
import { Pressable, Text, View } from "react-native";

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
  { key: "genres", icon: "🏷️", label: "Genres", color: "#60a5fa" },
  { key: "mood", icon: "💜", label: "Mood", color: "#c084fc" },
  { key: "duration", icon: "⏱️", label: "Duration", color: "#4ade80" },
];

function TrackingSelectorComponent({ value, onChange }: Props) {
  return (
    <View className="gap-3">
      <Text className="text-white/80 text-base font-semibold px-1">Find by</Text>
      <View className="flex-row gap-3">
        {options.map((option) => {
          const selected = option.key === value;
          return (
            <Pressable
              key={option.key}
              onPress={() => onChange(option.key)}
              className={`px-4 py-3 rounded-full border ${
                selected ? "border-white/80 bg-white/15" : "border-card-border bg-card-surface"
              }`}
              style={{ shadowColor: selected ? option.color : "transparent", shadowOpacity: 0.5, shadowRadius: 8 }}
            >
              <View className="flex-row items-center gap-2">
                <Text className="text-lg">{option.icon}</Text>
                <Text className={`text-sm font-medium ${selected ? "text-white" : "text-white/70"}`}>
                  {option.label}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export const TrackingSelector = memo(TrackingSelectorComponent);

