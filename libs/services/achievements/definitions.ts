export type AchievementCategory = 'rating' | 'collection' | 'sync' | 'pilgrimage' | 'social';
export type AchievementTrigger =
  | 'rating.like'
  | 'rating.pass'
  | 'rating.total'
  | 'collection.add'
  | 'collection.size'
  | 'sync.run'
  | 'sync.platforms'
  | 'pilgrimage.visit';

export interface AchievementDefinition {
  id: string;
  title: string;
  description: string;
  icon: string;
  category: AchievementCategory;
  target: number;
  trigger: AchievementTrigger;
  reward: { currency: 'coins' | 'shards'; amount: number };
}

export const ACHIEVEMENT_DEFINITIONS: AchievementDefinition[] = [
  {
    id: 'rating.first_like',
    title: 'First Crush',
    description: 'Like your first anime',
    icon: 'favorite',
    category: 'rating',
    target: 1,
    trigger: 'rating.like',
    reward: { currency: 'coins', amount: 50 },
  },
  {
    id: 'rating.10_likes',
    title: 'Tasteful Ten',
    description: 'Like 10 anime',
    icon: 'favorite',
    category: 'rating',
    target: 10,
    trigger: 'rating.like',
    reward: { currency: 'coins', amount: 200 },
  },
  {
    id: 'rating.100_total',
    title: 'Centurion Rater',
    description: 'Rate 100 anime in any direction',
    icon: 'thumbs-up-down',
    category: 'rating',
    target: 100,
    trigger: 'rating.total',
    reward: { currency: 'coins', amount: 1000 },
  },
  {
    id: 'collection.first',
    title: 'Curator Spark',
    description: 'Add your first anime to a collection',
    icon: 'collections-bookmark',
    category: 'collection',
    target: 1,
    trigger: 'collection.add',
    reward: { currency: 'coins', amount: 50 },
  },
  {
    id: 'collection.50',
    title: 'Library Builder',
    description: 'Reach 50 anime in your collection',
    icon: 'library-books',
    category: 'collection',
    target: 50,
    trigger: 'collection.size',
    reward: { currency: 'coins', amount: 500 },
  },
  {
    id: 'sync.connect_first',
    title: 'Bridged',
    description: 'Connect your first sync platform',
    icon: 'link',
    category: 'sync',
    target: 1,
    trigger: 'sync.platforms',
    reward: { currency: 'coins', amount: 100 },
  },
  {
    id: 'sync.connect_three',
    title: 'Cross-Tracker',
    description: 'Connect 3 sync platforms',
    icon: 'cell-tower',
    category: 'sync',
    target: 3,
    trigger: 'sync.platforms',
    reward: { currency: 'shards', amount: 5 },
  },
  {
    id: 'pilgrimage.first_visit',
    title: 'Pilgrim Begins',
    description: 'Visit your first pilgrimage location',
    icon: 'place',
    category: 'pilgrimage',
    target: 1,
    trigger: 'pilgrimage.visit',
    reward: { currency: 'shards', amount: 1 },
  },
  {
    id: 'pilgrimage.five_visits',
    title: 'Wanderer',
    description: 'Visit 5 pilgrimage locations',
    icon: 'travel-explore',
    category: 'pilgrimage',
    target: 5,
    trigger: 'pilgrimage.visit',
    reward: { currency: 'shards', amount: 10 },
  },
];

export function findDefinition(id: string): AchievementDefinition | undefined {
  return ACHIEVEMENT_DEFINITIONS.find((d) => d.id === id);
}

export function definitionsForTrigger(trigger: AchievementTrigger): AchievementDefinition[] {
  return ACHIEVEMENT_DEFINITIONS.filter((d) => d.trigger === trigger);
}
