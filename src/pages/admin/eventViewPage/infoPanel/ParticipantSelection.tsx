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
      <Typography variant="overline" color="text.secondary" sx={{ display: 'block', pt: 1, px: 1.5 }}>
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
              const canSendReserveNotification = !classFinished && numbers.reserve > 0
              let placeNotificationContent = (
                <Button
                  size="small"
                  disabled={!canSendPlaceNotification}
                  onClick={() => onOpenMessageDialog?.(selected, 'picked')}
                  color="primary"
                  variant={canSendPlaceNotification ? 'contained' : 'outlined'}
                >
                  {t('eventManagement.participantSelection.sendPlaceNotification')}
                </Button>
              )
              if (placeConfirmationsBlockedByEntry) {
                placeNotificationContent = (
                  <Typography variant="caption" color="text.secondary" sx={statusSx}>
                    {t('eventManagement.participantSelection.canSendAfterEntry')}
                  </Typography>
                )
              }
              if (placeNotificationsSent) {
                placeNotificationContent = (
                  <Typography variant="caption" color="info.main" sx={statusSx}>
                    {t('eventManagement.participantSelection.placeNotificationsSent')}
                  </Typography>
                )
              }

              return (
                <Fragment key={eventClass}>
                  <TableRow>
                    <TableCell align="left" sx={{ borderBottom: 0 }}>
                      <Typography variant="caption" noWrap fontWeight="bold" ml={2}>
                        {eventClass}
                      </Typography>
                    </TableCell>
                    <TableCell align="right" sx={{ borderBottom: 0 }}>
                      <Typography variant="caption" noWrap color={numbers.invalid ? 'error' : 'info.dark'}>
                        {numbers.participants} / {numbers.places}
                      </Typography>
                    </TableCell>
                    <TableCell align="right" sx={{ borderBottom: 0 }}>
                      {placeNotificationContent}
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell align="left" sx={{ pt: 0 }}>
                      <Typography variant="caption" noWrap ml={2}>
                        {t('eventManagement.participantSelection.reserve')}
                      </Typography>
                    </TableCell>
                    <TableCell align="right" sx={{ pt: 0 }}>
                      <Typography variant="caption" noWrap color="info.dark">
                        {numbers.reserve}
                      </Typography>
                    </TableCell>
                    <TableCell align="right" sx={{ pt: 0 }}>
                      {reserveNotificationsSent ? (
                        <Typography variant="caption" color="info.main" sx={statusSx}>
                          {t('eventManagement.participantSelection.reserveNotificationsSent')}
                        </Typography>
                      ) : (
                        <Button
                          size="small"
                          disabled={!canSendReserveNotification}
                          onClick={() => onOpenMessageDialog?.(reserves, 'reserve')}
                          color="primary"
                          variant={canSendReserveNotification ? 'contained' : 'outlined'}
                        >
                          {t('eventManagement.participantSelection.sendReserveNotification')}
                        </Button>
                      )}
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
