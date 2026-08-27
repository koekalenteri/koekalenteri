import type { PublicDogEvent } from '../../../../types'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { hasExplicitPlacesForClass, placesForClass, uniqueClasses } from '../../../../lib/event'
import InfoTableContainerGrid from '../../../components/InfoTableContainerGrid'
import InfoTableNumberGrid from '../../../components/InfoTableNumberGrid'
import InfoTableTextGrid from '../../../components/InfoTableTextGrid'

export type MinimalEvent = Pick<
  PublicDogEvent,
  'classes' | 'startDate' | 'entries' | 'places' | 'placesPerDay' | 'members'
>

export const EventClassPlaces = ({ event, eventClass }: { event: MinimalEvent; eventClass: string }) => {
  const { t } = useTranslation()

  const { dates, entryStatus, showPlaces } = useMemo(() => {
    const classes = event.classes.filter((c) => c.class === eventClass)
    const dates = classes.map((c) => c.date ?? event.startDate ?? new Date())

    const entryStatus = classes.reduce(
      (acc, c) => {
        // entries and members are already summarized per class
        acc.entries = c.entries ?? 0
        acc.members = c.members ?? 0
        return acc
      },
      { entries: 0, members: 0, places: placesForClass(event, eventClass) }
    )

    if (event.classes.length <= 1) {
      entryStatus.entries = event.entries ?? entryStatus.entries
      entryStatus.members = event.members ?? 0
    }

    // With a single class, the event-wide total genuinely is this class's total. With several
    // classes and no explicit per-class/per-day split, the places are a shared pool — showing
    // a number on this row would misleadingly imply it's this class's own capacity.
    const showPlaces = uniqueClasses(event).length <= 1 || hasExplicitPlacesForClass(event, eventClass)

    return { dates, entryStatus, showPlaces }
  }, [event, eventClass])

  return (
    <InfoTableContainerGrid>
      <InfoTableTextGrid size={{ xs: dates.length ? 2 : 6 }}>{eventClass}</InfoTableTextGrid>
      {dates.length ? (
        <InfoTableTextGrid size={{ xs: 4 }}>
          {dates.map((date) => t('dateFormat.wdshort', { date })).join(', ')}
        </InfoTableTextGrid>
      ) : null}
      <InfoTableNumberGrid size={{ xs: 2 }}>{entryStatus.entries}</InfoTableNumberGrid>
      <InfoTableNumberGrid size={{ xs: 2 }}>{showPlaces ? entryStatus.places : '–'}</InfoTableNumberGrid>
      <InfoTableNumberGrid size={{ xs: 2 }}>{entryStatus.members}</InfoTableNumberGrid>
    </InfoTableContainerGrid>
  )
}
