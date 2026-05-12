// Curated list of pilgrimage anime that resolve against api.anitabi.cn.
//
// These IDs were verified to return non-null payloads with `pointsLength >= 20`
// and a non-`[0,0]` center geo. They are used as a fallback pool when the
// signed-in user's collection has too few pilgrimage-eligible anime to fill
// the hub's "Popular Animes" rail and "Featured Spots" list.
//
// IMPORTANT: do not add IDs without confirming
//   curl https://api.anitabi.cn/bangumi/{id}/lite
// returns 200 with real `litePoints`. Anitabi only has data for a subset of
// Bangumi subjects; many otherwise-popular anime return 404.

export interface FeaturedAnime {
  bangumiId: number;
  displayName: string;
}

export const FEATURED_PILGRIMAGE_ANIME: readonly FeaturedAnime[] = [
  { bangumiId: 207195, displayName: 'ゆるキャン△' },
  { bangumiId: 115908, displayName: '響け！ユーフォニアム' },
  { bangumiId: 152091, displayName: '響け！ユーフォニアム 2' },
  { bangumiId: 328609, displayName: 'ぼっち・ざ・ろっく！' },
  { bangumiId: 262897, displayName: 'ゆるキャン△ SEASON2' },
  { bangumiId: 927, displayName: '秒速5センチメートル' },
  { bangumiId: 296659, displayName: 'ラブライブ！虹ヶ咲学園' },
  { bangumiId: 1424, displayName: 'けいおん！' },
  { bangumiId: 3774, displayName: 'けいおん！！' },
  { bangumiId: 100403, displayName: '冴えない彼女の育てかた' },
  { bangumiId: 58949, displayName: '言の葉の庭' },
  { bangumiId: 160209, displayName: '君の名は。' },
  { bangumiId: 430699, displayName: 'メダリスト' },
  { bangumiId: 402656, displayName: '青春ブタ野郎はおでかけシスターの夢を見ない' },
  { bangumiId: 10440, displayName: 'あの日見た花の名前を僕達はまだ知らない' },
  { bangumiId: 252655, displayName: 'ゾンビランドサガ' },
  { bangumiId: 287488, displayName: 'ゾンビランドサガ リベンジ' },
  { bangumiId: 221127, displayName: 'ゴールデンカムイ' },
  { bangumiId: 27364, displayName: '氷菓' },
  { bangumiId: 248175, displayName: 'かぐや様は告らせたい' },
  { bangumiId: 259, displayName: '夏目友人帳' },
  { bangumiId: 218708, displayName: '宇宙よりも遠い場所' },
  { bangumiId: 143205, displayName: '南鎌倉高校女子自転車部' },
  { bangumiId: 364450, displayName: 'リコリス・リコイル' },
  { bangumiId: 9912, displayName: '日常' },
  { bangumiId: 376703, displayName: 'アイドルマスター シンデレラガールズ U149' },
  { bangumiId: 269235, displayName: '天気の子' },
  { bangumiId: 805, displayName: '瀬戸の花嫁' },
  { bangumiId: 500, displayName: '耳をすませば' },
] as const;
