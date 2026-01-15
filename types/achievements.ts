export interface Achievement {
  id: string;
  title: string;
  description: string;
  icon: string;
  target: number;
  progress: number;
  completed: boolean;
  canStart: boolean;
  completedText: string;
  statusText: string;
  startButtonText: string;
  unlocked: boolean;
  category: 'rating' | 'gacha' | 'collection' | 'social';
}

export interface UserAchievement {
  achievementId: string;
  progress: number;
  unlocked: boolean;
  unlockedAt?: Date;
}

export interface Stats {
  total: number;
  watching: number;
  completed: number;
  dropped: number;
}

export type ThemeType = 'dark' | 'light' | 'midnight' | 'sunset' | 'ocean' | 'forest' | 'candy';

export interface Theme {
  id: ThemeType;
  name: string;
  color: string;
}

export interface UserProfile {
  id: string;
  username: string;
  email: string;
  avatarUrl?: string;
  theme: ThemeType;
  stats: Stats;
}
