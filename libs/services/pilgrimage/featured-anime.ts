// Curated list of well-known anime with rich pilgrimage data.
// Bangumi subject IDs are confirmed against bangumi.tv.

export interface FeaturedAnime {
  bangumiId: number;
  displayName: string;
}

export const FEATURED_PILGRIMAGE_ANIME: readonly FeaturedAnime[] = [
  { bangumiId: 32311, displayName: '氷菓 (Hyouka)' },
  { bangumiId: 363762, displayName: 'ぼっち・ざ・ろっく！' },
  { bangumiId: 217151, displayName: 'ゆるキャン△' },
  { bangumiId: 5530, displayName: 'K-On!' },
  { bangumiId: 70830, displayName: 'たまこまーけっと' },
  { bangumiId: 153434, displayName: '君の名は。' },
  { bangumiId: 18, displayName: 'Steins;Gate' },
  { bangumiId: 79233, displayName: 'さくら荘のペットな彼女' },
  { bangumiId: 144112, displayName: '響け！ユーフォニアム' },
  { bangumiId: 1217, displayName: 'らき☆すた' },
  { bangumiId: 224157, displayName: '宇宙よりも遠い場所' },
  { bangumiId: 376703, displayName: 'お兄ちゃんはおしまい！' },
] as const;
