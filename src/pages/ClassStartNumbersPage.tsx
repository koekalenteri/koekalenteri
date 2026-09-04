import type { StartNumberEntry } from '../api/startNumbers'
import type { ClassStartNumbers } from '../types'
import Box from '@mui/material/Box'
import Paper from '@mui/material/Paper'
import Typography from '@mui/material/Typography'
import { useAtomValue } from 'jotai'
import { enqueueSnackbar } from 'notistack'
import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useParams } from 'react-router'
import { APIError } from '../api/http'
import { getClassStartNumbers, putClassStartNumbers } from '../api/startNumbers'
import { useLinkedEntry } from '../hooks/useLinkedEntry'
import { reportError } from '../lib/client/error'
import { errorSnackbarOptions } from '../lib/client/snackbar'
import { linkedEventSubtitle } from '../lib/event'
import { isObject } from '../lib/utils'
import { StartNumbersEntry } from './admin/eventStartNumbersPage/StartNumbersEntry'
import LoadingIndicator from './components/LoadingIndicator'
import { languageAtom } from './state'

/**
 * A class secretary's draw sheet (KOE-1267), opened with the class's own tokenized link instead of an
 * account. A big trial draws every class at the same time, each with its own secretary, and none of
 * them is the event secretary — so each gets their class, and only their class: the same screen the
 * event secretary has, over the dogs and the numbers of one class.
 */
export function Component() {
  const { t } = useTranslation()
  const language = useAtomValue(languageAtom)
  const { eventId = '', eventClass = '', token = '' } = useParams()
  const load = useCallback(
    (signal: AbortSignal) => getClassStartNumbers(eventId, eventClass, token, signal),
    [eventClass, eventId, token]
  )
  const { entry, failed, setEntry } = useLinkedEntry<ClassStartNumbers>(load)

  const handleSave = useCallback(
    async (numbers: StartNumberEntry[]) => {
      try {
        const { patches } = await putClassStartNumbers(eventId, eventClass, numbers, token)

        // No socket carries these back to a link, so what the write returned is the stored truth:
        // folding it in is what turns the drafts into the numbers the sheet shows.
        setEntry(
          (previous) =>
            previous && {
              ...previous,
              registrations: previous.registrations.map((registration) => {
                const patch = patches.find((item) => item.id === registration.id)
                return patch ? { ...registration, startGroup: patch.startGroup ?? undefined } : registration
              }),
            }
        )
        enqueueSnackbar(t('startNumbers.saved'), { variant: 'success' })
        return true
      } catch (error) {
        // A number from outside the class's block is the refusal this link exists to make; say so in
        // those words rather than as a failed save.
        const outsideClass =
          error instanceof APIError && isObject(error.body) && error.body.error === 'startNumberOutsideClass'
        reportError(error)
        enqueueSnackbar(t(outsideClass ? 'startNumbers.outsideClass' : 'startNumbers.saveFailed'), errorSnackbarOptions)
        return false
      }
    },
    [eventClass, eventId, setEntry, t, token]
  )

  // A wrong link, a revoked one and a class that never ran all read the same, on purpose.
  if (failed) {
    return (
      <Typography sx={{ p: 2 }} variant="body1">
        {t('startNumbers.linkInvalid')}
      </Typography>
    )
  }

  if (!entry) return <LoadingIndicator />

  const subtitle = linkedEventSubtitle(entry.event, language, t)

  return (
    <Paper
      elevation={2}
      sx={{ display: 'flex', flexDirection: 'column', flexGrow: 1, maxHeight: '100%', maxWidth: '100%' }}
    >
      <StartNumbersEntry
        header={
          <Box sx={{ pt: 2, px: 2 }}>
            <Typography variant="h6">{t('startNumbers.title')}</Typography>
            <Typography
              variant="body2"
              sx={{
                color: 'text.secondary',
              }}
            >
              {subtitle}
            </Typography>
            <Typography
              variant="body2"
              sx={{
                color: 'text.secondary',
              }}
            >
              {t('startNumbers.linkInfo', { eventClass: entry.eventClass })}
            </Typography>
          </Box>
        }
        onSave={handleSave}
        registrations={entry.registrations}
      />
    </Paper>
  )
}
