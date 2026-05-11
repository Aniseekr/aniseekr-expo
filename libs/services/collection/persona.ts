import { StatsSummary, UserAnimeRow, ratioOfNightUpdates, longestStreakDays } from './stats-service';

export type PersonaDimensionKey =
  | 'sentimental'
  | 'adventurous'
  | 'romantic'
  | 'analytical'
  | 'devoted';

export interface PersonaDimension {
  key: PersonaDimensionKey;
  label: string;
  value: number;
  color: string;
}

export interface PersonaArchetype {
  id: string;
  index: number;
  total: number;
  title: string;
  description: string;
  rarity: number;
  tags: string[];
  imageBg: { from: string; to: string };
}

export interface PersonaResult {
  archetype: PersonaArchetype;
  match: number;
  watchHours: number;
  sinceLabel: string | null;
  dimensions: PersonaDimension[];
}

const TOTAL_TYPES = 8;

const ARCHETYPES: Omit<PersonaArchetype, 'index' | 'total'>[] = [
  {
    id: 'lyrical-wanderer',
    title: 'The Lyrical Wanderer',
    description:
      'You chase quiet beauty in motion — train windows, summer fields, the hush before a storm. Slice-of-life melodies guide your collection.',
    rarity: 4.2,
    tags: ['Nocturnal', 'Lyrical', 'Wanderer'],
    imageBg: { from: '#6E4AFF', to: '#21D4FD' },
  },
  {
    id: 'devoted-curator',
    title: 'The Devoted Curator',
    description:
      'You finish what you start. Your shelves are well-pruned, your scores generous, your loyalty fierce.',
    rarity: 6.1,
    tags: ['Devoted', 'Curated', 'Loyal'],
    imageBg: { from: '#F2994A', to: '#F2C94C' },
  },
  {
    id: 'sentimental-archivist',
    title: 'The Sentimental Archivist',
    description:
      'Every story leaves a mark. You rate from the heart and revisit favorites like old letters.',
    rarity: 5.8,
    tags: ['Sentimental', 'Romantic', 'Keeper'],
    imageBg: { from: '#FF6CAB', to: '#7366FF' },
  },
  {
    id: 'restless-explorer',
    title: 'The Restless Explorer',
    description:
      'You sample widely and skip without guilt. Newness fuels you more than completion.',
    rarity: 8.4,
    tags: ['Adventurous', 'Curious', 'Free'],
    imageBg: { from: '#3CB6FF', to: '#1E6BFF' },
  },
  {
    id: 'sharp-critic',
    title: 'The Sharp Critic',
    description:
      'You read every show twice — once for love, once for craft. Your ratings cut to the bone.',
    rarity: 7.2,
    tags: ['Analytical', 'Precise', 'Demanding'],
    imageBg: { from: '#232526', to: '#414345' },
  },
  {
    id: 'nocturnal-romantic',
    title: 'The Nocturnal Romantic',
    description:
      'Past midnight, the best stories arrive. You watch slow, score warm, and remember the ending.',
    rarity: 3.6,
    tags: ['Nocturnal', 'Romantic', 'Patient'],
    imageBg: { from: '#1F1C2C', to: '#928DAB' },
  },
  {
    id: 'marathon-runner',
    title: 'The Marathon Runner',
    description:
      'You binge in long arcs, finishing seasons before sunrise. Tempo over tasting notes.',
    rarity: 9.1,
    tags: ['Devoted', 'Adventurous', 'Endurance'],
    imageBg: { from: '#FF4E50', to: '#F9D423'},
  },
  {
    id: 'quiet-collector',
    title: 'The Quiet Collector',
    description:
      'A small but luminous library. You wait, you choose, you keep.',
    rarity: 10.5,
    tags: ['Curated', 'Patient', 'Selective'],
    imageBg: { from: '#0F2027', to: '#2C5364' },
  },
];

const DIMENSION_COLOR: Record<PersonaDimensionKey, string> = {
  sentimental: '#FFB200',
  adventurous: '#7C5BFF',
  romantic: '#FF5C8A',
  analytical: '#22D3EE',
  devoted: '#34D399',
};

const DIMENSION_LABEL: Record<PersonaDimensionKey, string> = {
  sentimental: 'Sentimental',
  adventurous: 'Adventurous',
  romantic: 'Romantic',
  analytical: 'Analytical',
  devoted: 'Devoted',
};

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function pct(value: number): number {
  return Math.round(clamp01(value) * 100);
}

export function computePersona(rows: UserAnimeRow[], summary: StatsSummary): PersonaResult | null {
  if (rows.length === 0 || summary.total < 3) return null;

  const completionRatio = summary.total > 0 ? summary.completed / summary.total : 0;
  const watchingRatio = summary.total > 0 ? summary.watching / summary.total : 0;
  const dropRatio = summary.total > 0 ? summary.dropped / summary.total : 0;
  const ratedRatio = summary.total > 0 ? summary.rated / summary.total : 0;
  const avgScoreNorm = summary.avgScore > 0 ? summary.avgScore / 10 : 0;
  const scoreVarNorm = clamp01(Math.sqrt(summary.scoreVariance) / 3);
  const nightRatio = ratioOfNightUpdates(summary.updatedDates);
  const binge = longestStreakDays(summary.completedDates);
  const bingeNorm = clamp01(binge / 7);

  const sentimental = clamp01(avgScoreNorm * 0.6 + completionRatio * 0.4);
  const adventurous = clamp01(0.4 * (1 - completionRatio) + 0.3 * watchingRatio + 0.3 * (summary.total / 100));
  const romantic = clamp01(avgScoreNorm * 0.5 + nightRatio * 0.3 + (1 - dropRatio) * 0.2);
  const analytical = clamp01(scoreVarNorm * 0.7 + ratedRatio * 0.3);
  const devoted = clamp01(completionRatio * 0.6 + bingeNorm * 0.2 + (1 - dropRatio) * 0.2);

  const dims: PersonaDimension[] = (
    ['sentimental', 'adventurous', 'romantic', 'analytical', 'devoted'] as PersonaDimensionKey[]
  ).map((key) => ({
    key,
    label: DIMENSION_LABEL[key],
    color: DIMENSION_COLOR[key],
    value: pct({
      sentimental,
      adventurous,
      romantic,
      analytical,
      devoted,
    }[key]),
  }));

  const sorted = [...dims].sort((a, b) => b.value - a.value);
  const top = sorted[0].key;
  const second = sorted[1].key;

  let pick = ARCHETYPES[0];
  if (top === 'devoted' && completionRatio > 0.7) pick = ARCHETYPES[1];
  else if (top === 'sentimental' && avgScoreNorm > 0.7) pick = ARCHETYPES[2];
  else if (top === 'adventurous' && watchingRatio > 0.4) pick = ARCHETYPES[3];
  else if (top === 'analytical' && scoreVarNorm > 0.5) pick = ARCHETYPES[4];
  else if (top === 'romantic' && nightRatio > 0.4) pick = ARCHETYPES[5];
  else if (top === 'devoted' && bingeNorm > 0.5) pick = ARCHETYPES[6];
  else if (summary.total < 12 && completionRatio > 0.5) pick = ARCHETYPES[7];
  else if (second === 'sentimental') pick = ARCHETYPES[2];

  const matchSpread = sorted[0].value - sorted[1].value;
  const match = Math.min(99, Math.max(60, 70 + Math.round(matchSpread * 0.5) + Math.round(sorted[0].value * 0.2)));

  const index = ARCHETYPES.findIndex((a) => a.id === pick.id) + 1;

  const sinceTs = summary.startedDates.length
    ? Math.min(...summary.startedDates)
    : summary.updatedDates.length
    ? Math.min(...summary.updatedDates)
    : null;
  const sinceLabel = sinceTs
    ? new Date(sinceTs).toLocaleString('en-US', { month: 'short', year: 'numeric' })
    : null;

  return {
    archetype: { ...pick, index, total: TOTAL_TYPES },
    match,
    watchHours: summary.watchHoursEst,
    sinceLabel,
    dimensions: sorted,
  };
}
