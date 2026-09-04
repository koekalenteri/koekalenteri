import type { TFunction } from 'i18next'
import type useAdminEventRegistrationInfo from '../../../../hooks/useAdminEventRegistrationsInfo'
import type { ConfirmedEvent, EmailTemplateId, Registration } from '../../../../types'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableContainer from '@mui/material/TableContainer'
import TableRow from '@mui/material/TableRow'
import Typography from '@mui/material/Typography'
import { Fragment } from 'react'
import { useTranslation } from 'react-i18next'
import { sectionSx } from './styles'

type RegistrationInfo = ReturnType<typeof useAdminEventRegistrationInfo>

interface Props {
  readonly entryEnded: boolean
  readonly event: ConfirmedEvent
  readonly eventFinished: boolean
  readonly numbersByClass: RegistrationInfo['numbersByClass']
  readonly onOpenMessageDialog?: (recipients: Registration[], templateId?: EmailTemplateId) => void
  readonly reserveByClass: RegistrationInfo['reserveByClass']
  readonly selectedByClass: RegistrationInfo['selectedByClass']
  readonly stateByClass: RegistrationInfo['stateByClass']
}

const statusSx = {
  alignItems: 'center',
  display: 'flex',
  justifyContent: 'flex-end',
  minHeight: 30,
}

const placeNotificationContent = (
  blocked: boolean,
  sent: boolean,
  canSend: boolean,
  selected: Registration[],
  onOpenMessageDialog: Props['onOpenMessageDialog'],
  t: TFunction
) => {
  if (sent) {
    return (
      <Typography
        variant="caption"
        sx={[
          {
            color: 'info.main',
          },
          ...(Array.isArray(statusSx) ? statusSx : [statusSx]),
        ]}
      >
        {t('eventManagement.participantSelection.placeNotificationsSent')}
      </Typography>
    )
  }
  if (blocked) {
    return (
      <Typography
        variant="caption"
        sx={[
          {
            color: 'text.secondary',
          },
          ...(Array.isArray(statusSx) ? statusSx : [statusSx]),
        ]}
      >
        {t('eventManagement.participantSelection.canSendAfterEntry')}
      </Typography>
    )
  }
  return (
    <Button
      size="small"
      disabled={!canSend}
      onClick={() => onOpenMessageDialog?.(selected, 'picked')}
      color="primary"
      variant={canSend ? 'contained' : 'outlined'}
    >
      {t('eventManagement.participantSelection.sendPlaceNotification')}
    </Button>
  )
}

const reserveNotificationContent = (
  blocked: boolean,
  sent: boolean,
  canSend: boolean,
  reserves: Registration[],
  onOpenMessageDialog: Props['onOpenMessageDialog'],
  t: TFunction
) => {
  if (sent) {
    return (
      <Typography
        variant="caption"
        sx={[
          {
            color: 'info.main',
          },
          ...(Array.isArray(statusSx) ? statusSx : [statusSx]),
        ]}
      >
        {t('eventManagement.participantSelection.reserveNotificationsSent')}
      </Typography>
    )
  }
  if (blocked) {
    return (
      <Typography
        variant="caption"
        sx={[
          {
            color: 'text.secondary',
          },
          ...(Array.isArray(statusSx) ? statusSx : [statusSx]),
        ]}
      >
        {t('eventManagement.participantSelection.reserveCanSendAfterEntry')}
      </Typography>
    )
  }
  return (
    <Button
      size="small"
      disabled={!canSend}
      onClick={() => onOpenMessageDialog?.(reserves, 'reserve')}
      color="primary"
      variant={canSend ? 'contained' : 'outlined'}
    >
      {t('eventManagement.participantSelection.sendReserveNotification')}
    </Button>
  )
}

const ParticipantSelection = ({
  entryEnded,
  event,
  eventFinished,
  numbersByClass,
  onOpenMessageDialog,
  reserveByClass,
  selectedByClass,
  stateByClass,
}: Props) => {
  const { t } = useTranslation()

  return (
    <Box sx={sectionSx}>
      <Typography
        variant="overline"
        sx={{
          color: 'text.secondary',
          display: 'block',
          pt: 1,
          px: 1.5,
        }}
      >
        {t('eventManagement.participantSelection.title')}
      </Typography>
      <TableContainer>
        <Table>
          <TableBody>
            {Object.entries(numbersByClass).map(([eventClass, numbers]) => {
              const selected = selectedByClass[eventClass] ?? []
              const reserves = reserveByClass[eventClass] ?? []
              const classState = stateByClass[eventClass] ?? event.state
              const classFinished = eventFinished || ['ended', 'completed'].includes(classState)
              const canSendPlaceNotification =
                entryEnded &&
                !classFinished &&
                numbers.participants > 0 &&
                !numbers.invalid &&
                classState === 'confirmed'
              const placeNotificationsSent =
                selected.length > 0 &&
                (['picked', 'invited'].includes(classState) ||
                  selected.every((registration) => registration.messagesSent?.picked))
              const placeConfirmationsBlockedByEntry = !entryEnded && !classFinished
              const reserveNotificationsSent =
                reserves.length > 0 && reserves.every((registration) => registration.reserveNotified)
              const reserveNotificationsBlockedByEntry = !entryEnded && !classFinished
              const canSendReserveNotification = entryEnded && !classFinished && numbers.reserve > 0
              const placeContent = placeNotificationContent(
                placeConfirmationsBlockedByEntry,
                placeNotificationsSent,
                canSendPlaceNotification,
                selected,
                onOpenMessageDialog,
                t
              )
              const reserveContent = reserveNotificationContent(
                reserveNotificationsBlockedByEntry,
                reserveNotificationsSent,
                canSendReserveNotification,
                reserves,
                onOpenMessageDialog,
                t
              )

              return (
                <Fragment key={eventClass}>
                  <TableRow>
                    <TableCell align="left" sx={{ borderBottom: 0 }}>
                      <Typography
                        variant="caption"
                        noWrap
                        sx={{
                          fontWeight: 'bold',
                          ml: 2,
                        }}
                      >
                        {eventClass}
                      </Typography>
                    </TableCell>
                    <TableCell align="right" sx={{ borderBottom: 0 }}>
                      <Typography variant="caption" noWrap color={numbers.invalid ? 'error' : 'info.dark'}>
                        {numbers.participants} / {numbers.places}
                      </Typography>
                    </TableCell>
                    <TableCell align="right" sx={{ borderBottom: 0 }}>
                      {placeContent}
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell align="left" sx={{ pt: 0 }}>
                      <Typography
                        variant="caption"
                        noWrap
                        sx={{
                          ml: 2,
                        }}
                      >
                        {t('eventManagement.participantSelection.reserve')}
                      </Typography>
                    </TableCell>
                    <TableCell align="right" sx={{ pt: 0 }}>
                      <Typography
                        variant="caption"
                        noWrap
                        sx={{
                          color: 'info.dark',
                        }}
                      >
                        {numbers.reserve}
                      </Typography>
                    </TableCell>
                    <TableCell align="right" sx={{ pt: 0 }}>
                      {reserveContent}
                    </TableCell>
                  </TableRow>
                </Fragment>
              )
            })}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  )
}

export default ParticipantSelection
