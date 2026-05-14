import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'fs';
import { resolve } from 'path';

interface DataFile {
  entries: Array<{
    id: number;
    titleJa: string;
    externalIds: { bangumi: number | null; anilist: number | null; mal: number | null };
  }>;
}

const DATA_PATH = resolve(
  import.meta.dir,
  '../../../libs/services/pilgrimage/anime-tourism-88.data.json'
);
const DATA = JSON.parse(readFileSync(DATA_PATH, 'utf8')) as DataFile;

function entry(id: number) {
  const found = DATA.entries.find((e) => e.id === id);
  if (!found) throw new Error(`Missing Anime Tourism 88 row #${id}`);
  return found;
}

describe('anime-tourism-88 manual data overrides', () => {
  it('uses Anitabi-backed canonical subjects for franchise rows', () => {
    expect(entry(9).externalIds).toMatchObject({
      bangumi: 40310,
      anilist: 14131,
      mal: 14131,
    });
    expect(entry(31).externalIds).toMatchObject({
      bangumi: 148099,
      anilist: 21403,
      mal: 31765,
    });
    expect(entry(54).externalIds).toMatchObject({
      bangumi: 110467,
      anilist: 20812,
      mal: 25835,
    });
    expect(entry(69).externalIds).toMatchObject({
      bangumi: 265,
      anilist: 30,
      mal: 30,
    });
    expect(entry(83).externalIds).toMatchObject({
      bangumi: 289,
      anilist: 934,
      mal: 934,
    });
  });
});
