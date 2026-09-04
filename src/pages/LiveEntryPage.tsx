import type { EventResultSubmission } from '../api/registration'
import type { StationEntry, StationTurnOp } from '../types'
import Typography from '@mui/material/Typography'
import { useAtomValue } from 'jotai'
import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useParams } from 'react-router'
import { getStationEntry, putStationEntry, putStationEntryTurn } from '../api/station'
import { useLinkedEntry } from '../hooks/useLinkedEntry'
import { linkedEventSubtitle } from '../lib/event'
import { StationScoring } from './admin/eventResultsPage/StationScoring'
import LoadingIndicator from './components/LoadingIndicator'
import { languageAtom } from './state'

/**
 * Live entry: the judge's secretary's scoring view, opened with the post's own tokenized link instead
 * of an account. What is written here is what the start list's Live section shows. The same screen the
 * event secretary has for a post — the difference is only where the data comes from, and that this
 * link sees one post's slice of the day and nothing more.
 */
export function Component() {
  const { t } = useTranslation()
  const language = useAtomValue(languageAtom)
  const { eventId = '', stationId = '', token = '' } = useParams()
  const load = useCallback(
    (signal: AbortSignal) => getStationEntry(eventId, stationId, token, signal),
    [eventId, stationId, token]
  )
  const { entry, failed, setEntry } = useLinkedEntry<StationEntry>(load)

  const handleSave = useCallback(
    async (submission: EventResultSubmission) => {
      const response = await putStationEntry(eventId, stationId, [submission], token)

      // What came back is now the stored truth for those dogs; folding it in keeps the queue's
      // scored-marks and the next correction's base version right without refetching the day.
      const written = [...response.saved, ...response.unchanged]
      setEntry(
        (previous) =>
          previous && {
            ...previous,
            registrations: previous.registrations.map((reg) => {
              const stored = written.find((item) => item.id === reg.id)
              return stored ? { ...reg, eventResult: stored.eventResult } : reg
            }),
          }
      )

      return response
    },
    [eventId, setEntry, stationId, token]
  )

  const handleTurn = useCallback(
    async (op: StationTurnOp) => {
      const response = await putStationEntryTurn(eventId, stationId, op, token)
      setEntry((previous) => previous && { ...previous, turns: response.turns })
    },
    [eventId, setEntry, stationId, token]
  )

  // A wrong link, a revoked one and a station that never existed all read the same, on purpose.
  if (failed) {
    return (
      <Typography sx={{ p: 2 }} variant="body1">
        {t('results.liveEntryLinkInvalid')}
      </Typography>
    )
  }

  if (!entry) return <LoadingIndicator />

  const subtitle = linkedEventSubtitle(entry.event, language, t)

  return (
    <StationScoring
      classes={entry.event.classes}
      eventType={entry.event.eventType}
      onSave={handleSave}
      onTurn={handleTurn}
      registrations={entry.registrations}
      station={entry.station}
      subtitle={subtitle}
      turns={entry.turns ?? []}
    />
  )
}
