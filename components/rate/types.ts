export type ViewMode = 'discovery' | 'tracking' | 'trend';

export interface Anime {
  id: string;
  title: string;
  titleEnglish?: string;
  image: string;
  bannerImage?: string;
  rank?: number;
  score?: number; // [NEW] 0-100 or 0-10
  type?: string; // [NEW] TV, MOVIE, etc.
  tags?: string[];
  mood?: string;
  description?: string;
  episodes?: number;
  durationMinutes?: number;
  studios?: string[];
  startDate?: {
    year: number | null;
    month: number | null;
    day: number | null;
  };
  status?: string;
  format?: string;
  nextAiringEpisode?: {
    airingAt: number;
    episode: number;
  };
}

export type Genre = {
  id: string;
  displayName: string;
  image: string;
};

export type Recommendation = {
  id: string;
  anime: Anime;
  reason: string;
};

export type Photo = {
  id: string;
  url: string;
  userId: string;
  title?: string;
  tags?: string[];
  score?: number;
  year?: number;
  type?: string;
  jpTitle?: string;
  enTitle?: string;
};

export type DeckItem = { kind: 'photo'; photo: Photo } | { kind: 'ad'; id: string };

export type PersonalizedPickState = {
  anime: Anime | null;
  loading: boolean;
  /** Human-readable explanation, e.g. "Because you liked X & Y". Null when loading / cold start. */
  reason: string | null;
  /** Anime titles from the user's library that drove this pick (max 2). */
  sourceTitles: string[];
  /** Genre tags shared between the pick and the user's positive signals. */
  matchedTags: string[];
  /** True when the user has no positive signals yet → render onboarding state. */
  coldStart: boolean;
};
