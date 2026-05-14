/**
 * Personalized Pick — content-based recommender, no AI/network model.
 *
 * Pipeline:
 *   1. Collect user signals (favorites + ratings).
 *   2. Fetch detail (cached) for the most recent N positives + negatives.
 *   3. Build a genre/tag preference vector, weighted + time-decayed.
 *   4. Pull a candidate pool (seasonal ∪ top), exclude already-seen ids.
 *   5. Score each candidate by dot product against the preference vector.
 *   6. Pick uniformly from top-K so consecutive opens don't repeat.
 *   7. Explain via the user's titles that most contributed to matched tags.
 *
 * Cold start (no positive signal yet) returns null — caller renders the
 * "rate a few first" state. This is the explicit replacement for the old
 * Math.random()-on-top-anime stub that violated CLAUDE.md Rule 8.
 */
import type { Anime } from '../../../components/rate/types';
import { LocalDB } from '../../db';
import { AnimeRepository } from '../../repositories/anime-repository';

export interface PersonalizedPickResult {
  anime: Anime;
  reason: string;
  /** Titles from the user's library that drove this pick (0–2). */
  sourceTitles: string[];
  /** Genre tags shared between the pick and the user's positive signals. */
  matchedTags: string[];
}

interface RatingRow {
  id: string;
  rating: 'like' | 'pass';
  timestamp: number;
}

const FAVORITE_WEIGHT = 1.5;
const LIKE_WEIGHT = 1.0;
const PASS_WEIGHT = -0.5;
const DECAY_HALF_LIFE_DAYS = 90;
const MAX_SAMPLES_PER_SIDE = 20;
const TOP_K_POOL = 5;

function decay(ageMs: number): number {
  const days = ageMs / (1000 * 60 * 60 * 24);
  return Math.exp(-days / DECAY_HALF_LIFE_DAYS);
}

async function loadRatings(): Promise<RatingRow[]> {
  const db = await LocalDB.getDatabase();
  const rows = await db.getAllAsync<RatingRow>(
    'SELECT id, rating, timestamp FROM ratings ORDER BY timestamp DESC'
  );
  return rows ?? [];
}

export async function pickPersonalized(): Promise<PersonalizedPickResult | null> {
  const [favorites, ratings, seenIds] = await Promise.all([
    LocalDB.getFavorites(),
    loadRatings(),
    LocalDB.getSwipeSeenIds(),
  ]);

  type Signal = {
    id: string;
    weight: number;
    ts: number;
    isPositive: boolean;
    titleHint: string | null;
  };

  const byId = new Map<string, Signal>();
  for (const f of favorites) {
    byId.set(f.id, {
      id: f.id,
      weight: FAVORITE_WEIGHT,
      ts: f.addedAt ?? Date.now(),
      isPositive: true,
      titleHint: f.title ?? null,
    });
  }
  for (const r of ratings) {
    const w = r.rating === 'like' ? LIKE_WEIGHT : PASS_WEIGHT;
    const existing = byId.get(r.id);
    if (!existing || Math.abs(w) > Math.abs(existing.weight)) {
      byId.set(r.id, {
        id: r.id,
        weight: w,
        ts: r.timestamp,
        isPositive: r.rating === 'like',
        titleHint: existing?.titleHint ?? null,
      });
    }
  }

  const signals = [...byId.values()];
  const hasPositive = signals.some((s) => s.isPositive);
  if (!hasPositive) return null;

  const positives = signals
    .filter((s) => s.isPositive)
    .sort((a, b) => b.ts - a.ts)
    .slice(0, MAX_SAMPLES_PER_SIDE);
  const negatives = signals
    .filter((s) => !s.isPositive)
    .sort((a, b) => b.ts - a.ts)
    .slice(0, MAX_SAMPLES_PER_SIDE);
  const sample = [...positives, ...negatives];

  const enriched = (
    await Promise.all(
      sample.map(async (s) => {
        try {
          const anime = await AnimeRepository.getAnimeDetails(s.id);
          return { signal: s, anime };
        } catch {
          return null;
        }
      })
    )
  ).filter((x): x is { signal: Signal; anime: Anime } => x !== null);

  const now = Date.now();
  const tagScore = new Map<string, number>();
  const tagPositiveSources = new Map<string, { title: string; weight: number }[]>();

  for (const { signal, anime } of enriched) {
    const tags = anime.tags ?? [];
    if (tags.length === 0) continue;
    const effective = signal.weight * decay(Math.max(0, now - signal.ts));
    const perTag = effective / Math.sqrt(tags.length);
    for (const tag of tags) {
      tagScore.set(tag, (tagScore.get(tag) ?? 0) + perTag);
      if (signal.isPositive && anime.title) {
        const list = tagPositiveSources.get(tag) ?? [];
        list.push({ title: anime.title, weight: perTag });
        tagPositiveSources.set(tag, list);
      }
    }
  }

  if (tagScore.size === 0) return null;

  const [seasonal, top] = await Promise.all([
    AnimeRepository.getSeasonalAnime().catch(() => [] as Anime[]),
    AnimeRepository.getTopAnime().catch(() => [] as Anime[]),
  ]);

  const seenSet = new Set<string>();
  for (const s of signals) seenSet.add(s.id);
  for (const id of seenIds) seenSet.add(id);

  const candidates = new Map<string, Anime>();
  for (const a of seasonal) if (!seenSet.has(a.id)) candidates.set(a.id, a);
  for (const a of top) if (!seenSet.has(a.id) && !candidates.has(a.id)) candidates.set(a.id, a);

  if (candidates.size === 0) return null;

  type Scored = { anime: Anime; score: number; matched: string[] };
  const scored: Scored[] = [];
  for (const anime of candidates.values()) {
    const tags = anime.tags ?? [];
    if (tags.length === 0) continue;
    let s = 0;
    const matched: string[] = [];
    for (const t of tags) {
      const v = tagScore.get(t);
      if (v === undefined) continue;
      if (v > 0) {
        s += v;
        matched.push(t);
      } else {
        s += v * 0.5;
      }
    }
    s = s / Math.sqrt(tags.length);
    if (anime.score && anime.score > 0) {
      s += Math.log10(Math.max(1, anime.score)) * 0.1;
    }
    if (s > 0) scored.push({ anime, score: s, matched });
  }

  if (scored.length === 0) return null;

  scored.sort((a, b) => b.score - a.score);
  const pool = scored.slice(0, TOP_K_POOL);
  const picked = pool[Math.floor(Math.random() * pool.length)];

  const titleContribution = new Map<string, number>();
  for (const tag of picked.matched) {
    const sources = tagPositiveSources.get(tag) ?? [];
    for (const src of sources) {
      titleContribution.set(src.title, (titleContribution.get(src.title) ?? 0) + src.weight);
    }
  }
  const sourceTitles = [...titleContribution.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([title]) => title);

  return {
    anime: picked.anime,
    reason: buildReason(sourceTitles, picked.matched),
    sourceTitles,
    matchedTags: picked.matched.slice(0, 3),
  };
}

function buildReason(sourceTitles: string[], matched: string[]): string {
  if (sourceTitles.length > 0) {
    return `Because you liked ${sourceTitles.join(' & ')}`;
  }
  const tags = matched.slice(0, 2).join(' · ');
  return tags ? `Matches your taste for ${tags}` : 'A fresh pick for you';
}
