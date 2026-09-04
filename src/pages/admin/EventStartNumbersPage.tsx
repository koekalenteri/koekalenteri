import type { StartNumberEntry } from '../../api/startNumbers'
import ContentCopy from '@mui/icons-material/ContentCopy'
import Button from '@mui/material/Button'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { useAtomValue } from 'jotai'
import { enqueueSnackbar } from 'notistack'
import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useParams } from 'react-router'
import { putStartNumbers } from '../../api/event'
import { getStartNumberLink } from '../../api/startNumbers'
import { reportError } from '../../lib/client/error'
import { errorSnackbarOptions } from '../../lib/client/snackbar'
import { isRegistrationClass } from '../../lib/registration'
import { Path } from '../../routeConfig'
import { idTokenAtom } from '../state'
import { EntryPageHeader } from './components/EntryPageHeader'
import EventNotFound from './components/EventNotFound'
import { StartNumbersEntry } from './eventStartNumbersPage/StartNumbersEntry'
import { adminConfirmedEventAtom, adminEventRegistrationsAtom, useAdminEventActions } from './state'

/**
 * The on-site draw's numbers, entered as a batch (KOE-1218). The calendar takes no part in the draw
 * itself: people draw at the venue, this screen receives the result — the same interaction shape as
 * results entry, which is what the ticket asks for.
 *
 * A big trial draws every class at once, each with its own secretary, so the class on screen can also
 * be handed out as a link of its own (KOE-1267) — the same sheet, without an account.
 */
export default function EventStartNumbersPage() {
  const { t } = useTranslation()
  const { id: eventId = '' } = useParams()
  const token = useAtomValue(idTokenAtom)
  const event = useAtomValue(adminConfirmedEventAtom(eventId))
  const registrations = useAtomValue(adminEventRegistrationsAtom(eventId))
  const eventActions = useAdminEventActions()

  const handleSave = useCallback(
    async (numbers: StartNumberEntry[], eventClass?: string) => {
      try {
        await putStartNumbers(
          eventId,
          { ...(isRegistrationClass(eventClass) ? { eventClass } : {}), numbers },
          token ?? ''
        )
        enqueueSnackbar(t('startNumbers.saved'), { variant: 'success' })
        return true
      } catch (error) {
        // The server names the refused number (a duplicate, a taken slot); keep the entries on screen.
        reportError(error)
        enqueueSnackbar(t('startNumbers.saveFailed'), errorSnackbarOptions)
        return false
      }
    },
    [eventId, t, token]
  )

  // The class secretary's link is the class on screen: whichever tab the secretary is looking at is
  // the sheet they hand on.
  const handleCopyLink = useCallback(
    async (eventClass: string) => {
      const { token: linkToken } = await getStartNumberLink(eventId, eventClass, token ?? '')
      await navigator.clipboard.writeText(
        `${globalThis.location.origin}${Path.classStartNumbers(eventId, eventClass, linkToken)}`
      )
      enqueueSnackbar(t('startNumbers.linkCopied', { eventClass }), { variant: 'success' })
    },
    [eventId, t, token]
  )

  // Bumping the class's version invalidates every link handed out for it; the next copy serves a fresh
  // one. The other classes' links are untouched — their secretaries are still drawing.
  const handleRevokeLink = useCallback(
    async (eventClass: string) => {
      if (!event) return
      const versions = event.startNumberLinkVersions ?? {}
      await eventActions.save({
        ...event,
        startNumberLinkVersions: { ...versions, [eventClass]: (versions[eventClass] ?? 1) + 1 },
      })
      enqueueSnackbar(t('startNumbers.linkRevoked', { eventClass }), { variant: 'success' })
    },
    [event, eventActions, t]
  )

  if (!event?.id) return <EventNotFound />

  return (
    <Paper
      elevation={2}
      sx={{ display: 'flex', flexDirection: 'column', flexGrow: 1, maxHeight: '100%', maxWidth: '100%' }}
    >
      <StartNumbersEntry
        header={
          <EntryPageHeader eventId={eventId} title={t('startNumbers.title')}>
            <Typography
              variant="body2"
              sx={{
                color: 'text.secondary',
              }}
            >
              {t('startNumbers.info')}
            </Typography>
          </EntryPageHeader>
        }
        onSave={handleSave}
        registrations={registrations}
        renderClassActions={(eventClass) => (
          <Stack
            direction="row"
            spacing={1}
            sx={{
              flexWrap: 'wrap',
              justifyContent: 'flex-end',
              px: 2,
            }}
          >
            <Button
              onClick={() => handleCopyLink(eventClass)}
              size="small"
              startIcon={<ContentCopy fontSize="small" />}
            >
              {t('startNumbers.copyLink')}
            </Button>
            <Button onClick={() => handleRevokeLink(eventClass)} size="small">
              {t('startNumbers.revokeLink')}
            </Button>
          </Stack>
        )}
      />
    </Paper>
  )
}
