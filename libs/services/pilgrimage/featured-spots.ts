export interface FeaturedSpotPriority {
  distanceKm?: number;
  planned?: boolean;
  fromCollection?: boolean;
}

const PLANNED_DISTANCE_BOOST_KM = 20;
const COLLECTION_DISTANCE_BOOST_KM = 4;

export function rankFeaturedSpotsByPriority<T extends FeaturedSpotPriority>(
  spots: readonly T[]
): T[] {
  return spots
    .map((spot, index) => ({
      spot,
      index,
      score: getFeaturedSpotPriorityScore(spot),
    }))
    .sort((a, b) => {
      const diff = a.score - b.score;
      return Math.abs(diff) > Number.EPSILON ? diff : a.index - b.index;
    })
    .map(({ spot }) => spot);
}

function getFeaturedSpotPriorityScore(spot: FeaturedSpotPriority): number {
  const hasDistance = typeof spot.distanceKm === 'number' && Number.isFinite(spot.distanceKm);
  if (!hasDistance) return Number.POSITIVE_INFINITY;

  let score = spot.distanceKm as number;
  if (spot.planned) score -= PLANNED_DISTANCE_BOOST_KM;
  if (spot.fromCollection) score -= COLLECTION_DISTANCE_BOOST_KM;
  return score;
}
