import { describe, expect, it } from 'bun:test';

import {
  mergePilgrimageSeriesEntries,
  resolvePilgrimageSeries,
  shouldIncludeRelatedSubjectInSeries,
} from '../../../libs/services/pilgrimage/pilgrimage-series';
import type { BangumiRelatedSubject, BangumiV0Subject } from '../../../libs/clients/bangumi-client';
import type { AnitabiBangumi, AnitabiPoint } from '../../../libs/services/pilgrimage/types';

function subject(
  id: number,
  name: string,
  overrides: Partial<BangumiV0Subject> = {}
): BangumiV0Subject {
  return {
    id,
    type: 2,
    name,
    name_cn: '',
    date: '2020-01-01',
    platform: 'TV',
    ...overrides,
  };
}

function related(
  id: number,
  name: string,
  relation: string,
  overrides: Partial<BangumiRelatedSubject> = {}
): BangumiRelatedSubject {
  return {
    id,
    type: 2,
    name,
    name_cn: '',
    relation,
    ...overrides,
  };
}

function point(id: string, name: string, ep: number): AnitabiPoint {
  return {
    id,
    name,
    image: `https://img/${id}.jpg`,
    ep,
    s: 0,
    geo: [35.6, 138.5],
  };
}

function anime(id: number, title: string, pointsLength: number): AnitabiBangumi {
  return {
    id,
    title,
    cn: '',
    city: '山梨県',
    cover: `https://image.anitabi.cn/bangumi/${id}.jpg`,
    color: '#4A90E2',
    geo: [35.6, 138.5],
    zoom: 12,
    modified: 1,
    litePoints: [point(`${id}-p1`, `${title} spot`, 1)],
    pointsLength,
    imagesLength: pointsLength,
  };
}

describe('pilgrimage related-series aggregation', () => {
  it('walks related anime subjects and only aggregates entries that have Anitabi data', async () => {
    const s1 = subject(207195, 'ゆるキャン△', { date: '2018-01-04' });
    const s2 = subject(262897, 'ゆるキャン△ SEASON 2', { date: '2021-01-07' });
    const movie = subject(262898, '映画 ゆるキャン△', {
      date: '2022-07-01',
      platform: '剧场版',
    });
    const s3 = subject(405785, 'ゆるキャン△ SEASON３', { date: '2024-04-04' });

    const subjects = new Map<number, BangumiV0Subject>([
      [s1.id, s1],
      [s2.id, s2],
      [movie.id, movie],
      [s3.id, s3],
    ]);
    const relatedById = new Map<number, BangumiRelatedSubject[]>([
      [
        s1.id,
        [
          related(s2.id, s2.name, '续集', { date: s2.date, platform: s2.platform }),
          related(movie.id, movie.name, '番外篇', { date: movie.date, platform: movie.platform }),
          related(485936, 'mono', '相同世界观'),
        ],
      ],
      [
        s2.id,
        [
          related(s1.id, s1.name, '前传', { date: s1.date }),
          related(s3.id, s3.name, '续集', { date: s3.date }),
        ],
      ],
      [movie.id, [related(s1.id, s1.name, '主线故事', { date: s1.date })]],
      [s3.id, [related(s2.id, s2.name, '前传', { date: s2.date })]],
    ]);
    const anitabi = new Map<number, AnitabiBangumi | null>([
      [s1.id, anime(s1.id, s1.name, 684)],
      [s2.id, anime(s2.id, s2.name, 334)],
      [movie.id, null],
      [s3.id, null],
    ]);

    const series = await resolvePilgrimageSeries(s1.id, {
      bangumiClient: {
        getSubject: async (id) => subjects.get(Number(id))!,
        getRelatedSubjects: async (id) => relatedById.get(Number(id)) ?? [],
      },
      anitabi: {
        getAnimePilgrimage: async (id) => anitabi.get(id) ?? null,
      },
      maxDepth: 2,
    });

    expect(series.entries.map((entry) => entry.subject.id)).toEqual([
      s1.id,
      s2.id,
      movie.id,
      s3.id,
    ]);
    expect(series.entries.map((entry) => entry.subject.label)).toEqual(['S1', 'S2', 'Movie', 'S3']);
    expect(series.availableEntries.map((entry) => entry.subject.id)).toEqual([s1.id, s2.id]);
    expect(series.unavailableEntries.map((entry) => entry.subject.id)).toEqual([movie.id, s3.id]);

    const merged = mergePilgrimageSeriesEntries(series.availableEntries, 'all');
    expect(merged.anime?.pointsLength).toBe(1018);
    expect(merged.points.map((p) => `${p.sourceLabel}:${p.id}`)).toEqual([
      'S1:207195-p1',
      'S2:262897-p1',
    ]);
  });

  it('uses relation strength and title affinity to avoid unrelated same-world subjects', () => {
    const yuru = subject(207195, 'ゆるキャン△');
    const mono = related(485936, 'mono', '相同世界观');
    const mygo = related(428735, "BanG Dream! It's MyGO!!!!!", '相同世界观');
    const bangDream = subject(186515, 'BanG Dream!');

    expect(shouldIncludeRelatedSubjectInSeries(yuru, mono)).toBe(false);
    expect(shouldIncludeRelatedSubjectInSeries(bangDream, mygo)).toBe(true);
    expect(
      shouldIncludeRelatedSubjectInSeries(yuru, related(262897, 'ゆるキャン△ SEASON 2', '续集'))
    ).toBe(true);
  });

  it('keeps franchise-style titles readable for individual series chips', async () => {
    const seed = subject(186515, 'BanG Dream!', { date: '2017-01-21' });
    const mygo = subject(428735, "BanG Dream! It's MyGO!!!!!", { date: '2023-06-29' });
    const ave = subject(454684, 'BanG Dream! Ave Mujica', { date: '2025-01-02' });
    const subjects = new Map<number, BangumiV0Subject>([
      [seed.id, seed],
      [mygo.id, mygo],
      [ave.id, ave],
    ]);

    const series = await resolvePilgrimageSeries(seed.id, {
      bangumiClient: {
        getSubject: async (id) => subjects.get(Number(id))!,
        getRelatedSubjects: async (id) =>
          Number(id) === seed.id
            ? [
                related(mygo.id, mygo.name, '相同世界观', { date: mygo.date }),
                related(ave.id, ave.name, '相同世界观', { date: ave.date }),
              ]
            : [],
      },
      anitabi: {
        getAnimePilgrimage: async (id) => anime(id, subjects.get(id)!.name, 10),
      },
      maxDepth: 1,
    });

    expect(series.entries.map((entry) => entry.subject.label)).toEqual([
      'BanG Dream!',
      "It's MyGO!!!!!",
      'Ave Mujica',
    ]);
  });
});
