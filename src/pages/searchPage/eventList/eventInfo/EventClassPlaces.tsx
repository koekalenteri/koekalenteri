import type { PublicDogEvent } from '../../../../types'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import InfoTableContainerGrid from '../../../components/InfoTableContainerGrid'
import InfoTableNumberGrid from '../../../components/InfoTableNumberGrid'
import InfoTableTextGrid from '../../../components/InfoTableTextGrid'

export type MinimalEvent = Pick<PublicDogEvent, 'classes' | 'startDate' | 'entries' | 'places' | 'members'>

export const EventClassPlaces = ({ event, eventClass }: { event: MinimalEvent; eventClass: string }) => {
  const { t } = useTranslation()

  const { dates, entryStatus } = useMemo(() => {
    const classes = event.classes.filter((c) => c.class === eventClass)
    const dates = classes.map((c) => c.date ?? event.startDate ?? new Date())

    const entryStatus = classes.reduce(
      (acc, c) => {
        acc.places += c.places ?? 0

        // entries and members are already summarized per class
        acc.entries = c.entries ?? 0
        acc.members = c.members ?? 0
        return acc
      },
      { entries: 0, members: 0, places: 0 }
    )

    if (event.classes.length <= 1) {
      entryStatus.places = event.places

      entryStatus.entries = event.entries ?? entryStatus.entries
      entryStatus.members = event.members ?? 0
    }

    return { dates, entryStatus }
  }, [event.classes, event.entries, event.members, event.places, event.startDate, eventClass])

  return (
    <InfoTableContainerGrid>
      <InfoTableTextGrid size={{ xs: dates.length ? 2 : 6 }}>{eventClass}</InfoTableTextGrid>
      {dates.length ? (
        <InfoTableTextGrid size={{ xs: 4 }}>
          {dates.map((date) => t('dateFormat.wdshort', { date })).join(', ')}
        </InfoTableTextGrid>
      ) : null}
      <InfoTableNumberGrid size={{ xs: 2 }}>{entryStatus.entries}</InfoTableNumberGrid>
      <InfoTableNumberGrid size={{ xs: 2 }}>{entryStatus.places}</InfoTableNumberGrid>
      <InfoTableNumberGrid size={{ xs: 2 }}>{entryStatus.members}</InfoTableNumberGrid>
    </InfoTableContainerGrid>
  )
}
