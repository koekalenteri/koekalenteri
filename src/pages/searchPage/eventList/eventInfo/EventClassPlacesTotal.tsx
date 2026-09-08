import type { PublicDogEvent } from '@/types'
import { useTranslation } from 'react-i18next'
import InfoTableContainerGrid from '@/pages/components/InfoTableContainerGrid'
import InfoTableNumberGrid from '@/pages/components/InfoTableNumberGrid'
import InfoTableTextGrid from '@/pages/components/InfoTableTextGrid'

export const EventClassPlacesTotal = ({ places }: { places: PublicDogEvent['places'] }) => {
  const { t } = useTranslation()

  return (
    <InfoTableContainerGrid>
      <InfoTableTextGrid size={{ xs: 8 }}>{t('event.classPlacesHeader.total')}</InfoTableTextGrid>
      <InfoTableNumberGrid size={{ xs: 2 }}>{places}</InfoTableNumberGrid>
      <InfoTableNumberGrid size={{ xs: 2 }} />
    </InfoTableContainerGrid>
  )
}
