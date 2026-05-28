import { StatsExhibitFrame } from '../../components/collection/stats/StatsExhibitFrame';
import { StatsOverview } from '../../components/collection/stats/StatsOverview';
import { useT } from '../../libs/i18n';

export default function OtakuDNAScreen() {
  const t = useT();
  return (
    <StatsExhibitFrame title={t('settings.otakuDna.title')}>
      <StatsOverview />
    </StatsExhibitFrame>
  );
}
