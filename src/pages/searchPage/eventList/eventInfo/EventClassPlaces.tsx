import type { PublicDogEvent } from '@/types'
import { useAtomValue } from 'jotai'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { classLabel, hasExplicitPlacesForClass, placesForClass, uniqueClasses } from '@/lib/event'
import InfoTableContainerGrid from '@/pages/components/InfoTableContainerGrid'
import InfoTableNumberGrid from '@/pages/components/InfoTableNumberGrid'
import InfoTableTextGrid from '@/pages/components/InfoTableTextGrid'
import { languageAtom } from '@/pages/state/user/atoms'

export type MinimalEvent = Pick<
  PublicDogEvent,
  'classes' | 'startDate' | 'entries' | 'places' | 'placesPerDay' | 'members' | 'ownClasses'
>

/**
 * The widths of the class and date columns, shared by the header and the rows. An own class's name is
 * longer than a code (KOE-674), so an event with own classes gives the class column a share of the
 * dates'. Without classes the one row is the format's and has no dates.
 */
export const classPlacesColumns = (event: Pick<PublicDogEvent, 'classes' | 'ownClasses'>) => {
  if (!event.classes.length) return { dates: 0, name: 6 }
  return event.ownClasses?.length ? { dates: 3, name: 3 } : { dates: 4, name: 2 }
}

export const EventClassPlaces = ({ event, eventClass }: { event: MinimalEvent; eventClass: string }) => {
  const { t } = useTranslation()
  const language = useAtomValue(languageAtom)
  const columns = classPlacesColumns(event)

  const { dates, entryStatus, showPlaces } = useMemo(() => {
    const classes = event.classes.filter((c) => c.class === eventClass)
    const dates = classes.map((c) => c.date ?? event.startDate)

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
      <InfoTableTextGrid size={{ xs: dates.length ? columns.name : 6 }}>
        {classLabel(event, eventClass, language)}
      </InfoTableTextGrid>
      {dates.length ? (
        <InfoTableTextGrid size={{ xs: columns.dates }}>
          {dates.map((date) => t('dateFormat.wdshort', { date })).join(', ')}
        </InfoTableTextGrid>
      ) : null}
      <InfoTableNumberGrid size={{ xs: 2 }}>{entryStatus.entries}</InfoTableNumberGrid>
      <InfoTableNumberGrid size={{ xs: 2 }}>{showPlaces ? entryStatus.places : '–'}</InfoTableNumberGrid>
      <InfoTableNumberGrid size={{ xs: 2 }}>{entryStatus.members}</InfoTableNumberGrid>
    </InfoTableContainerGrid>
  )
}
