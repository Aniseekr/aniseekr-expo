import { LocalDB } from '../../db';

const MINUTES_PER_EPISODE = 24;

export interface UserAnimeRow {
  anime_id: string;
  title: string | null;
  image_url: string | null;
  status: string;
  score: number | null;
  progress: number | null;
  total_episodes: number | null;
  started_at: number | null;
  completed_at: number | null;
  updated_at: number | null;
}

export interface StatsSummary {
  total: number;
  watching: number;
  completed: number;
  planned: number;
  dropped: number;
  onHold: number;
  rated: number;
  avgScore: number;
  scoreVariance: number;
  watchHoursEst: number;
  episodesWatched: number;
  startedDates: number[];
  completedDates: number[];
  updatedDates: number[];
  topScored: UserAnimeRow[];
}

export interface MonthlyHourBucket {
  monthIndex: number;
  label: string;
  hours: number;
}

export async function loadUserAnimeRows(): Promise<UserAnimeRow[]> {
  const db = await LocalDB.getDatabase();
  return db.getAllAsync<UserAnimeRow>(
    'SELECT anime_id, title, image_url, status, score, progress, total_episodes, started_at, completed_at, updated_at FROM user_anime'
  );
}

export function summarize(rows: UserAnimeRow[]): StatsSummary {
  const total = rows.length;
  let watching = 0;
  let completed = 0;
  let planned = 0;
  let dropped = 0;
  let onHold = 0;
  let episodesWatched = 0;
  const scores: number[] = [];
  const startedDates: number[] = [];
  const completedDates: number[] = [];
  const updatedDates: number[] = [];

  for (const r of rows) {
    switch (r.status) {
      case 'watching':
        watching += 1;
        break;
      case 'completed':
        completed += 1;
        break;
      case 'planned':
      case 'wishlist':
        planned += 1;
        break;
      case 'dropped':
        dropped += 1;
        break;
      case 'on_hold':
        onHold += 1;
        break;
    }
    if (typeof r.score === 'number' && r.score > 0) scores.push(r.score);
    const eps = r.status === 'completed' ? r.total_episodes ?? r.progress ?? 0 : r.progress ?? 0;
    episodesWatched += Math.max(0, eps);
    if (r.started_at) startedDates.push(r.started_at);
    if (r.completed_at) completedDates.push(r.completed_at);
    if (r.updated_at) updatedDates.push(r.updated_at);
  }

  const avgScore = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
  const scoreVariance = scores.length
    ? scores.reduce((acc, s) => acc + Math.pow(s - avgScore, 2), 0) / scores.length
    : 0;

  const topScored = [...rows]
    .filter((r) => typeof r.score === 'number' && r.score > 0)
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    .slice(0, 10);

  return {
    total,
    watching,
    completed,
    planned,
    dropped,
    onHold,
    rated: scores.length,
    avgScore,
    scoreVariance,
    watchHoursEst: Math.round((episodesWatched * MINUTES_PER_EPISODE) / 60),
    episodesWatched,
    startedDates,
    completedDates,
    updatedDates,
    topScored,
  };
}

export function monthlyHours(rows: UserAnimeRow[], year?: number): MonthlyHourBucket[] {
  const targetYear = year ?? new Date().getFullYear();
  const buckets: MonthlyHourBucket[] = Array.from({ length: 12 }, (_, i) => ({
    monthIndex: i,
    label: ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'][i],
    hours: 0,
  }));

  for (const r of rows) {
    if (!r.completed_at) continue;
    const d = new Date(r.completed_at);
    if (d.getFullYear() !== targetYear) continue;
    const eps = r.total_episodes ?? r.progress ?? 0;
    buckets[d.getMonth()].hours += (eps * MINUTES_PER_EPISODE) / 60;
  }

  return buckets.map((b) => ({ ...b, hours: Math.round(b.hours) }));
}

export function yearScope(rows: UserAnimeRow[], year: number): UserAnimeRow[] {
  return rows.filter((r) => {
    if (!r.completed_at) return false;
    return new Date(r.completed_at).getFullYear() === year;
  });
}

export function longestStreakDays(timestamps: number[]): number {
  if (timestamps.length === 0) return 0;
  const days = new Set<string>();
  for (const ts of timestamps) {
    const d = new Date(ts);
    days.add(`${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`);
  }
  const ordered = Array.from(days)
    .map((k) => {
      const [y, m, d] = k.split('-').map(Number);
      return new Date(y, m, d).getTime();
    })
    .sort((a, b) => a - b);
  let longest = 1;
  let current = 1;
  for (let i = 1; i < ordered.length; i += 1) {
    const gap = Math.round((ordered[i] - ordered[i - 1]) / 86_400_000);
    if (gap === 1) {
      current += 1;
      longest = Math.max(longest, current);
    } else if (gap > 1) {
      current = 1;
    }
  }
  return longest;
}

export function ratioOfNightUpdates(updatedAt: number[]): number {
  if (updatedAt.length === 0) return 0;
  const night = updatedAt.filter((ts) => {
    const h = new Date(ts).getHours();
    return h >= 22 || h < 5;
  }).length;
  return night / updatedAt.length;
}

export function firstActivity(rows: UserAnimeRow[]): number | null {
  let min = Infinity;
  for (const r of rows) {
    for (const t of [r.started_at, r.completed_at, r.updated_at]) {
      if (typeof t === 'number' && t > 0 && t < min) min = t;
    }
  }
  return min === Infinity ? null : min;
}
