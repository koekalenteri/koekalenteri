import type { EventKcIdChoice } from '../../../api/event'
import type { DogEvent, Patch } from '../../../types'
import { useAtomValue } from 'jotai'
import { enqueueSnackbar } from 'notistack'
import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { normalizeEventKcIdChoice, searchEventKcIdChoices } from '../../../api/event'
import { zonedDateString, zonedEndOfDay, zonedStartOfDay } from '../../../i18n/dates'
import { idTokenAtom } from '../../state'

/** The event details the Kennelliitto search matches against. */
interface KcIdLookupEvent {
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

const applyKcChoice = (choice: EventKcIdChoice): Patch<DogEvent> => {
  const normalized = normalizeEventKcIdChoice(choice)

  return {
    kcEvent: {
      classes: normalized.classes,
      endDate: zonedEndOfDay(normalized.endDate),
      eventType: normalized.eventType,
      judge: normalized.judge,
      location: normalized.location,
      startDate: zonedStartOfDay(normalized.startDate),
    },
    kcId: normalized.id,
  }
}

/**
 * Looking up an event's Kennelliitto id.
 *
 * Extracted from the event form because the secretary also needs it while entering results, which is
 * often the first time anyone notices the id is missing (KOE-452). One search, one set of messages, one
 * disambiguation — a second copy would drift from this one the first time the matching changed.
 */
export const useKcIdLookup = (
  event: KcIdLookupEvent,
  onChange?: (patch: Patch<DogEvent>) => void,
  linkedKcIds?: ReadonlySet<number>
) => {
  const { t } = useTranslation()
  const token = useAtomValue(idTokenAtom)
  const [searching, setSearching] = useState(false)
  const [choices, setChoices] = useState<EventKcIdChoice[]>([])
  const organizerId = event.organizer?.id

  // The koetunnus may already belong to another event; say so at pick time instead of leaving it to
  // the conflict the backend raises on save.
  const selectChoice = useCallback(
    (choice: EventKcIdChoice) => {
      if (linkedKcIds?.has(choice.id)) {
        enqueueSnackbar(t('event.kcIdConflict'), { variant: 'error' })
        return false
      }
      onChange?.(applyKcChoice(choice))
      enqueueSnackbar(t('event.kcIdSelected', { id: choice.id }), { variant: 'success' })
      return true
    },
    [linkedKcIds, onChange, t]
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

      if (result.choices.length === 1) {
        selectChoice(normalizeEventKcIdChoice(result.choices[0]))
      } else if (result.choices.length > 1) {
        setChoices(result.choices.map(normalizeEventKcIdChoice))
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
    onChange?.({ kcEvent: null, kcId: null })
    enqueueSnackbar(t('event.kcIdRemoved'), { variant: 'success' })
  }, [onChange, t])

  return { choices, choose, closeChoices: () => setChoices([]), organizerId, remove, search, searching }
}
