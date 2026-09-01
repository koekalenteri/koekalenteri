import type { EventResultSubmission } from '../api/registration'
import type { StationEntry } from '../types'
import Typography from '@mui/material/Typography'
import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useParams } from 'react-router'
import { getStationEntry, putStationEntry } from '../api/station'
import { StationScoring } from './admin/eventResultsPage/StationScoring'
import LoadingIndicator from './components/LoadingIndicator'

/**
 * The station secretary's scoring view, opened with the station's own tokenized link instead of an
 * account. The same screen the event secretary has for a post — the difference is only where the data
 * comes from, and that this link sees one post's slice of the day and nothing more.
 */
export function Component() {
  const { t } = useTranslation()
  const { eventId = '', stationId = '', token = '' } = useParams()
  const [entry, setEntry] = useState<StationEntry>()
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    const abort = new AbortController()

    getStationEntry(eventId, stationId, token, abort.signal)
      .then((data) => setEntry(data))
      .catch(() => {
        if (!abort.signal.aborted) setFailed(true)
      })

    return () => abort.abort()
  }, [eventId, stationId, token])

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
    [eventId, stationId, token]
  )

  // A wrong link, a revoked one and a station that never existed all read the same, on purpose.
  if (failed) {
    return (
      <Typography sx={{ p: 2 }} variant="body1">
        {t('results.stationLinkInvalid')}
      </Typography>
    )
  }

  if (!entry) return <LoadingIndicator />

  const subtitle = [
    t('dateFormat.datespan', { end: entry.event.endDate, start: entry.event.startDate }),
    entry.event.eventType,
    entry.event.location,
    entry.event.name,
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <StationScoring
      classes={entry.event.classes}
      eventType={entry.event.eventType}
      onSave={handleSave}
      registrations={entry.registrations}
      station={entry.station}
      subtitle={subtitle}
    />
  )
}
