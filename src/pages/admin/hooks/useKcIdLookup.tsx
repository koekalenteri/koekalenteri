import type { DogEvent, EventKcIdChoice, Patch } from '@/types'
import { useAtomValue } from 'jotai'
import { enqueueSnackbar } from 'notistack'
import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { searchEventKcIdChoices } from '@/api/event'
import { zonedDateString, zonedEndOfDay, zonedStartOfDay } from '@/i18n/dates'
import { idTokenAtom } from '../../state'

/** The event details the Kennelliitto search matches against. */
export interface KcIdLookupEvent {
  classes: DogEvent['classes']
  endDate: Date
  eventType?: string
  location?: string
  name?: string
  organizer?: { id?: string; name?: string }
  startDate: Date
}

const formatDateSpan = (start?: Date, end?: Date) => {
  if (!start) return ''
  const startDate = zonedDateString(start)
  const endDate = end ? zonedDateString(end) : startDate

  return startDate === endDate ? startDate : `${startDate} - ${endDate}`
}

/**
 * What selecting a trial stores. The server merges `kcEvent` into the stored one and deletes a key
 * only on an explicit null, so a field the new trial lacks is sent as null: switching from a trial
 * with a judge to one without must not leave the first one's judge behind. `kcId`, the old API's
 * integer, is not touched.
 */
const applyKcChoice = (choice: EventKcIdChoice): Patch<DogEvent> => {
  return {
    kcEvent: {
      classes: choice.classes,
      endDate: zonedEndOfDay(choice.endDate),
      eventType: choice.eventType,
      judge: choice.judge ?? null,
      judgeId: choice.judgeId ?? null,
      location: choice.location ?? null,
      startDate: zonedStartOfDay(choice.startDate),
    },
    kcGuid: choice.kcGuid,
  }
}

/**
 * Looking up the Kennelliitto trial of an event, and linking its GUID.
 *
 * Extracted from the event form because the secretary also needs it while entering results, which is
 * often the first time anyone notices the id is missing (KOE-452). One search, one set of messages, one
 * disambiguation — a second copy would drift from this one the first time the matching changed.
 */
export const useKcIdLookup = (
  event: KcIdLookupEvent,
  onChange?: (patch: Patch<DogEvent>) => void,
  linkedKcGuids?: ReadonlySet<string>
) => {
  const { t } = useTranslation()
  const token = useAtomValue(idTokenAtom)
  const [searching, setSearching] = useState(false)
  const [choices, setChoices] = useState<EventKcIdChoice[]>([])
  const organizerId = event.organizer?.id

  // The trial may already belong to another event; say so at pick time instead of leaving it to
  // the conflict the backend raises on save. A trial without a GUID cannot be linked at all.
  const selectChoice = useCallback(
    (choice: EventKcIdChoice) => {
      if (!choice.kcGuid) return false
      if (linkedKcGuids?.has(choice.kcGuid)) {
        enqueueSnackbar(t('event.kcGuidConflict'), { variant: 'error' })
        return false
      }
      onChange?.(applyKcChoice(choice))
      enqueueSnackbar(t('event.kcIdSelected'), { variant: 'success' })
      return true
    },
    [linkedKcGuids, onChange, t]
  )

  const search = useCallback(async () => {
    if (!organizerId) return

    const criteria = [event.organizer?.name, event.eventType, formatDateSpan(event.startDate, event.endDate)]
      .filter(Boolean)
      .join(', ')

    setSearching(true)
    setChoices([])
    try {
      const result = await searchEventKcIdChoices(
        {
          classes: event.classes.map(({ class: eventClass, date }) => ({ class: eventClass, date })),
          endDate: event.endDate,
          eventType: event.eventType ?? '',
          location: event.location ?? '',
          name: event.name ?? '',
          organizer: { id: organizerId },
          startDate: event.startDate,
        },
        token
      )

      // One trial with a GUID is taken as it is; one without is shown, so the secretary is told why
      // nothing was linked.
      if (result.choices.length === 1 && result.choices[0].kcGuid) {
        selectChoice(result.choices[0])
      } else if (result.choices.length > 0) {
        setChoices(result.choices)
      } else {
        enqueueSnackbar(t('event.kcIdNotFound', { criteria }), { variant: 'warning' })
      }
    } catch (error) {
      console.error(error)
      enqueueSnackbar(t('event.kcIdSearchFailed'), { variant: 'error' })
    } finally {
      setSearching(false)
    }
  }, [event, organizerId, token, t, selectChoice])

  const choose = useCallback(
    (choice: EventKcIdChoice) => {
      if (selectChoice(choice)) setChoices([])
    },
    [selectChoice]
  )

  const remove = useCallback(() => {
    onChange?.({ kcEvent: null, kcGuid: null })
    enqueueSnackbar(t('event.kcIdRemoved'), { variant: 'success' })
  }, [onChange, t])

  return { choices, choose, closeChoices: () => setChoices([]), organizerId, remove, search, searching }
}
