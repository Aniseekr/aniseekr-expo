import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Dimensions } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withSequence,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { Achievement } from '../../types/achievements';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface AchievementProps {
  achievement: Achievement;
  unlocked: boolean;
  progress: number;
  onPress?: () => void;
}

interface AchievementBadgeProps {
  achievement: Achievement;
  unlocked: boolean;
  progress: number;
}

export function AchievementBadge({ achievement, unlocked, progress }: AchievementBadgeProps) {
  const scale = useSharedValue(0.8);
  const opacity = useSharedValue(unlocked ? 1 : 0.5);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value, opacity: opacity.value }],
  }));

  return (
    <Animated.View style={[styles.badge, animatedStyle]}>
      <Text style={[styles.badgeText, unlocked && styles.badgeTextUnlocked]}>
        {achievement.icon}
      </Text>
    </Animated.View>
  );
}

export function AchievementProgress({ value, maxValue }: { value: number; maxValue: number }) {
  const animatedValue = useSharedValue(0);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: animatedValue.value,
  }));

  useEffect(() => {
    animatedValue.value = withSpring(value, { damping: 12, stiffness: 200 });
  }, [value, maxValue]);

  return (
    <View style={styles.progressContainer}>
      <Animated.View style={[styles.progressBar, animatedStyle]}>
        <View style={[styles.progressFill, { width: `${(value / maxValue) * 100}%` }]} />
      </Animated.View>
    </View>
  );
}

export function AchievementDetailDialog({
  achievement,
  unlocked,
  progress,
  onPress,
}: AchievementProps) {
  const [visible, setVisible] = useState(false);

  const handleClose = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setVisible(false);
  };

  const handlePress = () => {
    if (!unlocked && onPress) {
      onPress();
    }
  };

  const overlayStyle = useAnimatedStyle(() => ({
    opacity: visible ? 1 : 0,
  }));

  return (
    <Animated.View
      style={[styles.overlay, overlayStyle]}
      pointerEvents={visible ? 'box-none' : 'auto'}>
      <View style={styles.dialog}>
        <Text style={styles.dialogTitle}>{achievement.title}</Text>
        <Text style={styles.dialogDescription}>{achievement.description}</Text>
        <Text style={styles.progressLabel}>
          Progress: {progress} / {achievement.target}
        </Text>

        <AchievementProgress value={progress} maxValue={achievement.target || 100} />

        <View style={styles.dialogActions}>
          <TouchableOpacity style={[styles.dialogButton, styles.closeButton]} onPress={handleClose}>
            <Text style={styles.buttonText}>Close</Text>
          </TouchableOpacity>

          {unlocked && (
            <TouchableOpacity
              style={[styles.dialogButton, styles.unlockButton]}
              onPress={() => handlePress()}>
              <Text style={styles.buttonText}>Start Task</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </Animated.View>
  );
}

export function AchievementCard({ achievement, unlocked, progress, onPress }: AchievementProps) {
  const scale = useSharedValue(0);
  const opacity = useSharedValue(unlocked ? 1 : 0.5);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value, opacity: opacity.value }],
  }));

  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onPress?.();
  };

  return (
    <Animated.View style={[styles.card, animatedStyle, unlocked && styles.cardUnlocked]}>
      <View style={styles.cardHeader}>
        <Text style={styles.achievementIcon}>{achievement.icon}</Text>
        <Text style={styles.achievementTitle}>{achievement.title}</Text>
      </View>

      <View style={styles.progressSection}>
        <Text style={styles.progressLabel}>
          Progress: {progress} / {achievement.target}
        </Text>
        <AchievementProgress value={progress} maxValue={achievement.target || 100} />
        <Text style={styles.statusText}>
          {progress === achievement.target ? 'Completed' : 'In Progress'}
        </Text>
      </View>

      {!unlocked && achievement.canStart && (
        <TouchableOpacity
          style={[styles.startButton, !achievement.canStart && styles.startButtonDisabled]}
          onPress={() => handlePress()}
          disabled={!achievement.canStart}>
          <Text style={styles.startButtonText}>{achievement.startButtonText}</Text>
        </TouchableOpacity>
      )}
    </Animated.View>
  );
}

export function AchievementsList({
  achievements,
  onAchievementPress,
}: {
  achievements: Achievement[];
  onAchievementPress: (achievement: Achievement) => void;
}) {
  const sortedAchievements = achievements.sort((a, b) => a.id.localeCompare(b.id));

  return (
    <View style={styles.container}>
      {sortedAchievements.map((achievement) => (
        <TouchableOpacity
          key={achievement.id}
          style={styles.listItem}
          onPress={() => onAchievementPress(achievement)}>
          <AchievementCard
            achievement={achievement}
            unlocked={achievement.unlocked}
            progress={achievement.progress}
            onPress={() => onAchievementPress(achievement)}
          />
        </TouchableOpacity>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 20,
  },

  listItem: {
    marginBottom: 16,
  },

  card: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 16,
    padding: 20,
    marginHorizontal: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 6,
  },

  cardUnlocked: {
    backgroundColor: 'rgba(200, 200, 200, 0.05)',
  },

  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },

  achievementIcon: {
    fontSize: 32,
  },

  achievementTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
    flex: 1,
    marginLeft: 12,
  },

  progressSection: {
    alignItems: 'center',
    marginTop: 8,
  },

  progressLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 4,
  },

  statusText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
    textAlign: 'center',
    marginTop: 4,
  },

  startButton: {
    backgroundColor: '#fbbf24',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 20,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 4,
  },

  startButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },

  startButtonDisabled: {
    backgroundColor: 'rgba(251, 191, 36, 0.5)',
  },

  badge: {
    position: 'absolute',
    top: -8,
    right: -8,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#fbbf24',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#fff',
    overflow: 'hidden',
  },

  badgeText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#fff',
  },

  badgeTextUnlocked: {
    color: 'rgba(255, 255, 255, 0.3)',
  },

  progressContainer: {
    alignItems: 'center',
    marginTop: 12,
    height: 4,
  },

  progressBar: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    overflow: 'hidden',
  },

  progressFill: {
    height: '100%',
    backgroundColor: '#fbbf24',
    borderRadius: 1,
  },

  dialog: {
    backgroundColor: '#1e293b',
    borderRadius: 20,
    padding: 24,
    margin: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 10,
  },

  dialogTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 12,
  },

  dialogDescription: {
    fontSize: 16,
    fontWeight: '400',
    color: 'rgba(255, 255, 255, 0.9)',
    lineHeight: 22,
    marginBottom: 16,
  },

  dialogActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 24,
  },

  dialogButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
    alignItems: 'center',
    minHeight: 48,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },

  button: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },

  buttonText: {
    color: 'rgba(255, 255, 255, 0.9)',
  },

  closeButton: {
    backgroundColor: 'rgba(251, 191, 36, 0.5)',
  },

  unlockButton: {
    backgroundColor: '#fbbf24',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 6,
  },

  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
  },

  overlayVisible: {
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
  },
});
