import type { EventResultSubmission } from '../api/registration'
import type { StationEntry, StationEntryDog, StationTurnOp } from '../types'
import Typography from '@mui/material/Typography'
import { useAtomValue } from 'jotai'
import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useParams } from 'react-router'
import { getStationEntry, putStationEntry, putStationEntryTurn } from '../api/station'
import { useLinkedEntry } from '../hooks/useLinkedEntry'
import { reportError } from '../lib/client/error'
import { linkedEventSubtitle } from '../lib/event'
import { HiddenPageTitle } from './components/HiddenPageTitle'
import LoadingIndicator from './components/LoadingIndicator'
import { StationScoring } from './components/stationScoring/StationScoring'
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

  // What is stored for those dogs, as the server said; folding it in keeps the queue's scored-marks and the
  // next correction's base version right without refetching the day.
  const foldStored = useCallback(
    (written: readonly Pick<StationEntryDog, 'id' | 'eventResult'>[]) =>
      setEntry(
        (previous) =>
          previous && {
            ...previous,
            registrations: previous.registrations.map((reg) => {
              const stored = written.find((item) => item.id === reg.id)
              return stored ? { ...reg, eventResult: stored.eventResult } : reg
            }),
          }
      ),
    [setEntry]
  )

  const handleSave = useCallback(
    async (submission: EventResultSubmission) => {
      const response = await putStationEntry(eventId, stationId, [submission], token)
      foldStored([...response.saved, ...response.unchanged])
      return response
    },
    [eventId, foldStored, stationId, token]
  )

  const handleStored = useCallback(
    (stored: Pick<StationEntryDog, 'id' | 'eventResult'>) => foldStored([stored]),
    [foldStored]
  )

  const handleTurn = useCallback(
    async (op: StationTurnOp) => {
      const response = await putStationEntryTurn(eventId, stationId, op, token)
      setEntry((previous) => previous && { ...previous, turns: response.turns })
    },
    [eventId, setEntry, stationId, token]
  )

  const handleLocked = useCallback(
    () => setEntry((previous) => previous && { ...previous, event: { ...previous.event, locked: true } }),
    [setEntry]
  )

  // A dog the trial no longer has, or a running order changed: the link has no socket to hear of either, so the
  // day's list is read again and the post goes on with the dogs and the order that are.
  const handleRefused = useCallback(() => {
    load(new AbortController().signal)
      .then((data) => setEntry(data))
      .catch(reportError)
  }, [load, setEntry])

  // A wrong link, a revoked one and a station that never existed all read the same, on purpose.
  if (failed) {
    return (
      <>
        <HiddenPageTitle>{t('results.liveEntryTitle')}</HiddenPageTitle>
        <Typography sx={{ p: 2 }} variant="body1">
          {t('results.liveEntryLinkInvalid')}
        </Typography>
      </>
    )
  }

  if (!entry) return <LoadingIndicator />

  const subtitle = linkedEventSubtitle(entry.event, language, t)

  return (
    <StationScoring
      classes={entry.event.classes}
      eventType={entry.event.eventType}
      locked={entry.event.locked}
      lockedText={t('results.kennelliitto.lockedLive')}
      onLocked={handleLocked}
      onRefused={handleRefused}
      onSave={handleSave}
      onStored={handleStored}
      onTurn={handleTurn}
      ownOutcomeOnly
      registrations={entry.registrations}
      station={entry.station}
      subtitle={subtitle}
      turns={entry.turns ?? []}
    />
  )
}
