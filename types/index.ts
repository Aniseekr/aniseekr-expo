export interface Anime {
  id: string;
  title: string;
  titleEnglish: string;
  titleRomaji: string;
  titleJapanese: string;
  synonyms: string[];
  genres: string[];
  studios: string[];
  source: string;
  description: string;
  descriptionEnglish: string;
  format: string;
  season: 'Winter' | 'Spring' | 'Summer' | 'Fall';
  seasonYear: number;
  status: 'finished' | 'releasing' | 'upcoming' | 'cancelled' | 'hiatus' | 'airing' | 'ended';
  averageScore: number;
  meanScore: number;
  scoringMode: 'POINT_10' | 'POINT_100' | 'DECIMAL_10';
  popularity: number;
  trendingRank: number;
  isAdult: boolean;
  episodes: number;
  duration: number;
  coverImage: string;
  bannerImage: string;
  startDate: FuzzyDate;
  endDate: FuzzyDate | null;
  nextAiring: FuzzyDate | null;
  genres: Genre[];
  ratingDistribution: {
    score: number;
    user: number;
  }[];
  characters: Character[];
  studios: {
    id: string;
    name: string;
    media: 'anime' | 'manga' | 'light_novel' | 'visual_novel' | 'game' | 'music' | 'other';
    isMain: boolean;
    url: string;
    images: CharacterImage[];
  };
  airingSchedule: AiringSchedule[];
  externalLinks: {
    officialSite: string;
    wikipedia: string;
    animeNewsNetwork: string;
    community: string;
    discord: string;
  };
  relations: Relation[];
  streamingInfo: StreamingInfo[];
  preferences: {
    scoreFormat: 'POINT_10' | 'POINT_100' | 'DECIMAL_10';
    airingStatusDisplay: 'text' | 'icon';
  };

  staff: Staff[];
}

export interface Character {
  id: string;
  name: string;
  animeId: string;
  animeTitle: string;
  animeTitleEnglish: string;
  animeTitleRomaji: string;
  animeTitleJapanese: string;
  imageUrl: string;
  birthday: FuzzyDate;
  favorites: number;
  voiceActors: VoiceActor[];
  imageUrl: string;
}

export interface CharacterImage {
  width: number;
  height: number;
  url: string;
  source?: string;
}

export interface VoiceActor {
  name: string;
  role: string;
  language: string;
  imageUrl: string;
}

export interface Character {
  favoriteCount: number;
  completedCount: number;
  droppedCount: number;
  watchingCount: number;
  planToWatch: number;
  totalMinutesWatched: number;
}

export interface VoiceActor {
  id: string;
  characterId: string;
  name: string;
  role: string;
  imageUrl: string;
}

export interface Genre {
  id: number;
  name: string;
  nameEnglish: string;
  description: string;
  imageUrl: string;
  anilistId?: string;
}

export interface GenreImage {
  id: string;
  url: string;
  mediumThumbnail: string;
  largeThumbnail: string;
}

export interface UserRating {
  id: string;
  animeId: string;
  score: number;
  comment?: string;
  createdAt: Date;
  updatedAt?: Date;
}

export interface UserAnime {
  id: string;
  animeId: string;
  status: 'watching' | 'completed' | 'dropped' | 'plan_to_watch';
  rating?: UserRating;
  folder?: string;
  customLists?: string[];
  tags?: string[];
}

export interface UserStats {
  totalWatched: number;
  totalCompleted: number;
  totalDropped: number;
  totalPlanToWatch: number;
  averageScore: number;
  genres: Record<string, number>;
}

export interface GachaCard {
  id: string;
  rarity: 'SSR' | 'SR' | 'R' | 'N';
  animeId: string;
  animeTitle: string;
  imageUrl: string;
  shards: number;
  totalShards: number;
  duplicateShards: number;
  acquiredAt?: Date;
}

export interface Wallet {
  coins: number;
  shards: number;
  dailyBonusClaimed: boolean;
  lastBonusClaimedAt: Date | null;
  nextBonusAt: Date | null;
}

export interface ShardExchangeRate {
  shards: number;
  exchangeRate: number;
}

export interface NotificationSettings {
  pushEnabled: boolean;
  airingReminders: boolean;
  weeklyRecap: boolean;
  achievementAlerts: boolean;
  marketingEmails: boolean;
}

export interface UserPreferences {
  theme: ThemeType;
  language: string;
  pushNotifications: boolean;
  emailDigests: boolean;
  privacyMode: 'public' | 'friends_only';
  dataUsage: 'minimal' | 'standard';
}

export interface UserProfile {
  id: string;
  username: string;
  email: string;
  avatarUrl?: string;
  theme: ThemeType;
  stats: UserStats;
  settings: UserPreferences;
  createdAt: Date;
  updatedAt?: Date;
}

export interface Session {
  user: UserProfile;
  token: string;
  expiresAt: Date;
  refreshExpiresIn: number;
}

export interface CollectionFolder {
  id: string;
  name: string;
  icon: string;
  isShared: boolean;
  isSystemFolder: boolean;
  isR18: boolean;
  folderType: 'custom' | 'wishlist' | 'favorites' | 'watching' | 'completed' | 'dropped';
  createdAt: Date;
  animeCount: number;
  sharedBy: number;
  sortOrder?: number;
}

export interface FavoriteAnime {
  id: string;
  animeId: string;
  addedAt: Date;
  notes?: string;
}

export interface Collection {
  folders: CollectionFolder[];
  favorites: FavoriteAnime[];
  watchlist: UserAnime[];
  customLists: UserAnime[];
}

export interface AnimeSearchFilters {
  genres?: number[];
  studios?: string[];
  year?: number;
  season?: 'Winter' | 'Spring' | 'Summer' | 'Fall';
  format?:
    | 'TV'
    | 'TV_SHORT'
    | 'TV'
    | 'OVA'
    | 'ONA'
    | 'MOVIE'
    | 'WEB_NOVEL'
    | 'WEB_SHORT'
    | 'WEB_SHORT'
    | 'OTHER'
    | 'MUSIC'
    | 'SPECIAL'
    | 'GAME';
  status?: 'finished' | 'releasing' | 'upcoming' | 'cancelled' | 'hiatus' | 'airing' | 'ended';
  source?: string;
  search?: string;
  year?: number;
}

export interface SwipeInteraction {
  direction: 'left' | 'right';
  velocity: number;
  thresholdMet: boolean;
  distance: number;
}

export interface PhotoCardPhoto {
  id: string;
  url: string;
  isLiked: boolean;
  isSkipped: boolean;
  rating?: UserRating;
  displayed: boolean;
}

export interface RatingStats {
  totalRated: number;
  likes: number;
  superLikes: number;
  skips: number;
  dislikes: number;
  genres: Record<string, number>;
}

export interface RatingSession {
  photos: PhotoCardPhoto[];
  currentIndex: number;
  history: SwipeInteraction[];
  stats: RatingStats;
  preferences: RatingPreferences;
}

export interface RatingPreferences {
  autoPlay: boolean;
  soundEnabled: boolean;
  hapticFeedback: boolean;
  skipAnimation: boolean;
  swipeThreshold: number;
  preferredLanguage: string;
}

export interface AchievementProgress {
  achievementId: string;
  progress: number;
  target: number;
  completed: boolean;
  unlocked: boolean;
  lastProgressUpdate: Date;
}

export interface AchievementNotification {
  achievementId: string;
  progress: number;
  isNewlyUnlocked: boolean;
  canStart: boolean;
}

export interface ThemeConfig {
  id: ThemeType;
  name: string;
  primaryColor: string;
  secondaryColor: string;
  backgroundColor: string;
  textColor: string;
  cardBackgroundColor: string;
  cardBorderColor: string;
  shadowColor: string;
}

export interface AppSettings {
  devMode: boolean;
  analyticsEnabled: boolean;
  crashReportingEnabled: boolean;
  featureFlags: Record<string, boolean>;
}
