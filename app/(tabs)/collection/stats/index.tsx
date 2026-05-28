import { StatsExhibitFrame } from '../../../../components/collection/stats/StatsExhibitFrame';
import { StatsOverview } from '../../../../components/collection/stats/StatsOverview';
import { useT } from '../../../../libs/i18n';

export default function CollectionStatsScreen() {
  const t = useT();
  return (
    <StatsExhibitFrame title={t('collectionStats.hub.title')}>
      <StatsOverview showThresholdHighlight />
    </StatsExhibitFrame>
  );
}
