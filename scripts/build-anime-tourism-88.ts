#!/usr/bin/env bun
// Build the offline Anime Tourism 88 dataset consumed by
// libs/services/pilgrimage/anime88-repository.ts.
//
// The 88-spot selection (一般社団法人アニメツーリズム協会) has no public API;
// the canonical list lives in an HTML table on the per-year edition pages:
//   - https://animetourism88.com/animespot88/{year}edition/      (JP, e.g. 2025edition)
//   - https://animetourism88.com/en/animespot88-en/{year}edition-en/  (EN)
//
// What this script does:
//   1. Fetch the JP + EN edition pages, parse the jump1 (anime) table rows.
//   2. Split the JP "自治体名" cell into prefecture + city, classify by region.
//   3. Resolve each unique JP title to a Bangumi subject id via the public
//      Bangumi search API (v0). Manual overrides patch a handful of franchise
//      titles whose top-1 result is wrong (Ultraman, GAMERA, トラペジウム,
//      Do It Yourself!!).
//   4. Write libs/services/pilgrimage/anime-tourism-88.data.json.
//
// Re-run for next year's edition:
//   bun run scripts/build-anime-tourism-88.ts --year 2026
//
// Follow with `bun run scripts/resolve-anime88-anilist.ts` to add AniList ids
// + popularity. Follow that with `bun run scripts/build-anitabi-index.ts
// --extra <ids>` to expand Anitabi spot coverage.

import { writeFileSync } from 'fs';
import { resolve } from 'path';

const ROOT = resolve(import.meta.dir, '..');
const OUTPUT_PATH = resolve(ROOT, 'libs/services/pilgrimage/anime-tourism-88.data.json');

const YEAR = parseYear();
const JP_URL = `https://animetourism88.com/animespot88/${YEAR}edition/`;
const EN_URL = `https://animetourism88.com/en/animespot88-en/${YEAR}edition-en/`;
const BANGUMI_SEARCH = 'https://api.bgm.tv/v0/search/subjects?limit=5';
const USER_AGENT =
  process.env.SCRAPE_USER_AGENT ??
  'aniseekr-expo/0.1 (https://github.com/kidneyweakx ; gm@solidarity.gg)';
const BGM_DELAY_MS = Number(process.env.BGM_DELAY_MS ?? '1000');

// 47 prefectures grouped to match the 7 categories used on animetourism88.com
// (note: 東京都 is split from 関東 in their taxonomy).
const PREFECTURE_TO_REGION: Record<string, AnimeTourism88Region> = {
  北海道: 'hokkaido_tohoku',
  青森県: 'hokkaido_tohoku',
  岩手県: 'hokkaido_tohoku',
  宮城県: 'hokkaido_tohoku',
  秋田県: 'hokkaido_tohoku',
  山形県: 'hokkaido_tohoku',
  福島県: 'hokkaido_tohoku',
  茨城県: 'kanto',
  栃木県: 'kanto',
  群馬県: 'kanto',
  埼玉県: 'kanto',
  千葉県: 'kanto',
  神奈川県: 'kanto',
  東京都: 'tokyo',
  新潟県: 'chubu',
  富山県: 'chubu',
  石川県: 'chubu',
  福井県: 'chubu',
  山梨県: 'chubu',
  長野県: 'chubu',
  岐阜県: 'chubu',
  静岡県: 'chubu',
  愛知県: 'chubu',
  三重県: 'kinki',
  滋賀県: 'kinki',
  京都府: 'kinki',
  大阪府: 'kinki',
  兵庫県: 'kinki',
  奈良県: 'kinki',
  和歌山県: 'kinki',
  鳥取県: 'chugoku_shikoku',
  島根県: 'chugoku_shikoku',
  岡山県: 'chugoku_shikoku',
  広島県: 'chugoku_shikoku',
  山口県: 'chugoku_shikoku',
  徳島県: 'chugoku_shikoku',
  香川県: 'chugoku_shikoku',
  愛媛県: 'chugoku_shikoku',
  高知県: 'chugoku_shikoku',
  福岡県: 'kyushu_okinawa',
  佐賀県: 'kyushu_okinawa',
  長崎県: 'kyushu_okinawa',
  熊本県: 'kyushu_okinawa',
  大分県: 'kyushu_okinawa',
  宮崎県: 'kyushu_okinawa',
  鹿児島県: 'kyushu_okinawa',
  沖縄県: 'kyushu_okinawa',
};
const PREFECTURE_PREFIXES = Object.keys(PREFECTURE_TO_REGION).sort((a, b) => b.length - a.length);

// Top-1 Bangumi search misfires we patched by hand. Keyed by canonical JP title
// as it appears in the 88 table. Update when the JP table text changes.
const BANGUMI_OVERRIDES: Record<
  string,
  { bangumiId: number; name?: string; nameCn?: string; date?: string; note?: string }
> = {
  '映画『トラペジウム』': {
    bangumiId: 469877,
    name: 'トラペジウム',
    nameCn: '四重星',
    date: '2024-05-10',
  },
  'GAMERA -Rebirth-': {
    bangumiId: 418289,
    name: 'GAMERA -Rebirth-',
    nameCn: '大怪兽加美拉:重生',
    date: '2023-09-07',
  },
  'Do It Yourself!! -どぅー・いっと・ゆあせるふ-': {
    bangumiId: 331445,
    name: 'Do It Yourself!! -どぅー・いっと・ゆあせるふ-',
    nameCn: '少女手工',
    date: '2022-10-05',
  },
  'ガールズ＆パンツァー 最終章': {
    bangumiId: 40310,
    name: 'ガールズ＆パンツァー',
    nameCn: '少女与战车',
    date: '2012-10-08',
    note: 'Prefer the Anitabi-rich main series over Saishuushou episode subjects.',
  },
  '『エヴァンゲリオン』シリーズ': {
    bangumiId: 265,
    name: '新世紀エヴァンゲリオン',
    nameCn: '新世纪福音战士',
    date: '1995-10-04',
    note: 'Canonical TV series; Bangumi search top-1 can misfire to EVANGELION THE REAL 4D.',
  },
  '劇場版 ソードアート・オンライン -オーディナル・スケール-': {
    bangumiId: 148099,
    name: '劇場版 ソードアート・オンライン -オーディナル・スケール-',
    nameCn: '刀剑神域 序列之争',
    date: '2017-02-18',
    note: 'Exact film subject; cleaned query can fall back to SAO TV.',
  },
  '劇場版「SHIROBAKO」': {
    bangumiId: 110467,
    name: 'SHIROBAKO',
    nameCn: '白箱',
    date: '2014-10-09',
    note: 'Prefer the Anitabi-rich TV series over the movie subject.',
  },
  'ひぐらしのなく頃に業・卒': {
    bangumiId: 289,
    name: 'ひぐらしのなく頃に',
    nameCn: '寒蝉鸣泣之时',
    date: '2006-04-04',
    note: 'Prefer the Anitabi-rich original series over Gou/Sotsu subjects.',
  },
  'ウルトラマンシリーズ（円谷英二氏生誕の地）': {
    bangumiId: 38650,
    name: 'ウルトラマン',
    nameCn: '奥特曼',
    date: '1966-07-17',
    note: 'Canonical 1966 Ultraman; verify externalIds.',
  },
  'ウルトラマンシリーズ（ウルトラマン商店街）': {
    bangumiId: 38650,
    name: 'ウルトラマン',
    nameCn: '奥特曼',
    date: '1966-07-17',
    note: 'Canonical 1966 Ultraman; verify externalIds.',
  },
  'ウルトラマンシリーズ（金城哲夫資料館）': {
    bangumiId: 38650,
    name: 'ウルトラマン',
    nameCn: '奥特曼',
    date: '1966-07-17',
    note: 'Canonical 1966 Ultraman; verify externalIds.',
  },
};

type AnimeTourism88Region =
  | 'hokkaido_tohoku'
  | 'kanto'
  | 'tokyo'
  | 'chubu'
  | 'kinki'
  | 'chugoku_shikoku'
  | 'kyushu_okinawa';

interface Entry {
  id: number;
  year: number;
  titleJa: string;
  titleEn: string;
  region: AnimeTourism88Region | null;
  prefecture: string | null;
  city: string;
  regionEn: string;
  externalIds: { bangumi: number | null; anilist: null; mal: null };
}

interface BangumiSearchResult {
  id: number;
  name: string;
  name_cn?: string;
  date?: string;
}

function parseYear(): number {
  const flagIdx = process.argv.indexOf('--year');
  if (flagIdx > -1 && process.argv[flagIdx + 1]) {
    const n = Number(process.argv[flagIdx + 1]);
    if (Number.isFinite(n) && n >= 2018 && n <= 2099) return n;
    throw new Error(
      `--year argument must be a valid edition year, got ${process.argv[flagIdx + 1]}`
    );
  }
  return 2025;
}

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  if (!res.ok) throw new Error(`GET ${url} -> HTTP ${res.status}`);
  return res.text();
}

const TR_PATTERN = /<tr>\s*<td>([\s\S]*?)<\/td>\s*<td>([\s\S]*?)<\/td>\s*<\/tr>/g;
const TAG_PATTERN = /<[^>]+>/g;
const HTML_ENTITIES: Array<[string, string]> = [
  ['&nbsp;', ' '],
  ['&amp;', '&'],
  ['&#8217;', '’'],
  ['&#8211;', '–'],
  ['&#8220;', '“'],
  ['&#8221;', '”'],
];

function decodeEntities(s: string): string {
  let out = s;
  for (const [src, dst] of HTML_ENTITIES) out = out.split(src).join(dst);
  return out;
}

function parseJump1Table(html: string): Array<[string, string]> {
  const startIdx = html.indexOf('id="jump1"');
  const endIdx = html.indexOf('id="jump2"', startIdx);
  if (startIdx < 0) throw new Error('jump1 anchor not found — page structure changed?');
  const section = endIdx > startIdx ? html.slice(startIdx, endIdx) : html.slice(startIdx);
  const rows: Array<[string, string]> = [];
  for (const match of section.matchAll(TR_PATTERN)) {
    const a = decodeEntities(match[1].replace(TAG_PATTERN, '')).trim();
    const b = decodeEntities(match[2].replace(TAG_PATTERN, '')).trim();
    if (a && b) rows.push([a, b]);
  }
  return rows;
}

function splitPrefectureCity(raw: string): { prefecture: string | null; city: string } {
  const s = raw.trim();
  for (const pref of PREFECTURE_PREFIXES) {
    if (s.startsWith(pref)) return { prefecture: pref, city: s.slice(pref.length).trim() };
  }
  return { prefecture: null, city: s };
}

function cleanBangumiQuery(title: string): string {
  return title
    .replace(/[『』「」]/g, '')
    .replace(/シリーズ$/, '')
    .replace(/^劇場版/, '')
    .replace(/^映画/, '')
    .replace(/\([^)]*\)$/, '')
    .replace(/（[^）]*）$/, '')
    .trim();
}

function normalizeForMatch(s: string | undefined | null): string {
  if (!s) return '';
  return s
    .replace(/[！]/g, '!')
    .replace(/[？]/g, '?')
    .replace(/[『』「」]/g, '')
    .replace(/[\s\-–—・　]+/g, '')
    .toLowerCase();
}

async function searchBangumi(keyword: string): Promise<BangumiSearchResult[]> {
  const res = await fetch(BANGUMI_SEARCH, {
    method: 'POST',
    headers: {
      'User-Agent': USER_AGENT,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ keyword, filter: { type: [2] } }),
  });
  if (!res.ok) throw new Error(`Bangumi search ${keyword} -> HTTP ${res.status}`);
  const json = (await res.json()) as { data?: BangumiSearchResult[] };
  return json.data ?? [];
}

interface BgmMatch {
  result: BangumiSearchResult | null;
  reason: string;
}

function pickBangumi(titleJa: string, results: BangumiSearchResult[]): BgmMatch {
  if (results.length === 0) return { result: null, reason: 'no_results' };
  const target = normalizeForMatch(titleJa);
  for (const r of results) {
    if (normalizeForMatch(r.name) === target) return { result: r, reason: 'exact_name' };
    if (normalizeForMatch(r.name_cn) === target) return { result: r, reason: 'exact_name_cn' };
  }
  return { result: results[0], reason: 'top1_fallback' };
}

function delay(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((r) => setTimeout(r, ms));
}

async function main(): Promise<void> {
  console.log(`[anime88] year=${YEAR} fetching JP + EN edition pages`);
  const [jpHtml, enHtml] = await Promise.all([fetchText(JP_URL), fetchText(EN_URL)]);

  const jpRows = parseJump1Table(jpHtml);
  const enRows = parseJump1Table(enHtml);
  if (jpRows.length === 0) throw new Error('JP table parsed 0 rows — page structure changed?');
  if (jpRows.length !== enRows.length) {
    console.warn(
      `[anime88] WARN: JP rows (${jpRows.length}) != EN rows (${enRows.length}); alignment may drift`
    );
  }

  console.log(`[anime88] parsed ${jpRows.length} rows`);

  const entries: Entry[] = [];
  for (let i = 0; i < jpRows.length; i++) {
    const [titleJa, regionJa] = jpRows[i];
    const en = enRows[i] ?? ['', ''];
    const { prefecture, city } = splitPrefectureCity(regionJa);
    const region = prefecture ? PREFECTURE_TO_REGION[prefecture] : null;
    entries.push({
      id: i + 1,
      year: YEAR,
      titleJa,
      titleEn: en[0],
      region: region ?? null,
      prefecture,
      city,
      regionEn: en[1],
      externalIds: { bangumi: null, anilist: null, mal: null },
    });
  }

  const uniqueTitles = Array.from(new Set(entries.map((e) => e.titleJa)));
  console.log(
    `[anime88] resolving ${uniqueTitles.length} unique JP titles via Bangumi search (${BGM_DELAY_MS}ms delay)`
  );

  const titleToBangumi = new Map<string, number>();
  let needsReviewCount = 0;
  for (let i = 0; i < uniqueTitles.length; i++) {
    const title = uniqueTitles[i];
    const override = BANGUMI_OVERRIDES[title];
    if (override) {
      titleToBangumi.set(title, override.bangumiId);
      console.log(
        `[${i + 1}/${uniqueTitles.length}] ${title} -> override bgm#${override.bangumiId}`
      );
      continue;
    }
    const query = cleanBangumiQuery(title) || title;
    try {
      const results = await searchBangumi(query);
      const { result, reason } = pickBangumi(title, results);
      if (result) {
        titleToBangumi.set(title, result.id);
        if (reason === 'top1_fallback') needsReviewCount++;
        console.log(`[${i + 1}/${uniqueTitles.length}] ${title} -> bgm#${result.id} (${reason})`);
      } else {
        console.log(`[${i + 1}/${uniqueTitles.length}] ${title} -> MISS (${reason})`);
      }
    } catch (err) {
      console.warn(`[${i + 1}/${uniqueTitles.length}] ${title} -> ERR ${(err as Error).message}`);
    }
    await delay(BGM_DELAY_MS);
  }

  for (const entry of entries) {
    const bid = titleToBangumi.get(entry.titleJa);
    if (typeof bid === 'number') entry.externalIds.bangumi = bid;
  }

  const output = {
    generatedAt: new Date().toISOString().slice(0, 10),
    source: JP_URL,
    year: YEAR,
    count: entries.length,
    entries,
  };
  writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2) + '\n', 'utf8');

  const withBgm = entries.filter((e) => e.externalIds.bangumi).length;
  const noPrefecture = entries.filter((e) => !e.region).length;
  console.log(
    `\n[anime88] done. wrote ${entries.length} entries to ${OUTPUT_PATH}\n` +
      `  with bangumi id: ${withBgm}/${entries.length}\n` +
      `  unresolved region: ${noPrefecture}\n` +
      `  bangumi top1-fallbacks (worth reviewing): ${needsReviewCount}\n\n` +
      `Next steps:\n` +
      `  bun run scripts/resolve-anime88-anilist.ts        # add AniList ids + popularity\n` +
      `  bun run scripts/build-anitabi-index.ts --extra $(node -e "...")  # expand Anitabi coverage`
  );
}

main().catch((err: unknown) => {
  console.error('[anime88] failed:', err);
  process.exit(1);
});
