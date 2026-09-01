import type useAdminEventRegistrationInfo from '../../../../hooks/useAdminEventRegistrationsInfo'
import type { ConfirmedEvent, RegistrationClass } from '../../../../types'
import FormatListNumberedOutlined from '@mui/icons-material/FormatListNumberedOutlined'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Stack from '@mui/material/Stack'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableContainer from '@mui/material/TableContainer'
import TableRow from '@mui/material/TableRow'
import Typography from '@mui/material/Typography'
import { enqueueSnackbar } from 'notistack'
import { useTranslation } from 'react-i18next'
import { errorSnackbarOptions } from '../../../../lib/client/snackbar'
import {
  canPublishStartList,
  isStartListAvailable,
  isStartListAvailableForClass,
  isStartNumbersAvailable,
  isStartNumbersAvailableForClass,
} from '../../../../lib/event'
import { getInvitationRecipients, isRegistrationClass } from '../../../../lib/registration'
import { Path } from '../../../../routeConfig'
import { actionButtonSx, sectionSx } from './styles'

type RegistrationInfo = ReturnType<typeof useAdminEventRegistrationInfo>

const getStartListAuditMessageKey = (eventClass: RegistrationClass | undefined, published: boolean) => {
  if (eventClass) return published ? 'audit.messages.classStartListPublished' : 'audit.messages.classStartListHidden'
  return published ? 'audit.messages.startListPublished' : 'audit.messages.startListHidden'
}

const getStartNumbersAuditMessageKey = (eventClass: RegistrationClass | undefined, published: boolean) => {
  if (eventClass) {
    return published ? 'audit.messages.classStartNumbersPublished' : 'audit.messages.classStartNumbersHidden'
  }
  return published ? 'audit.messages.startNumbersPublished' : 'audit.messages.startNumbersHidden'
}

interface Props {
  readonly event: ConfirmedEvent
  readonly eventWithCurrentAttachments: ConfirmedEvent
  readonly numbersByClass: RegistrationInfo['numbersByClass']
  readonly onSetStartListPublished?: (eventClass: RegistrationClass | undefined, published: boolean) => Promise<unknown>
  readonly onSetStartNumbersPublished?: (
    eventClass: RegistrationClass | undefined,
    published: boolean
  ) => Promise<unknown>
  readonly selectedByClass: RegistrationInfo['selectedByClass']
  readonly stateByClass: RegistrationInfo['stateByClass']
}

const StartListPublishing = ({
  event,
  eventWithCurrentAttachments,
  numbersByClass,
  onSetStartListPublished,
  onSetStartNumbersPublished,
  selectedByClass,
  stateByClass,
}: Props) => {
  const { t } = useTranslation()
  const isStartListPublished = (eventClass?: ConfirmedEvent['classes'][number]) =>
    eventClass
      ? isStartListAvailableForClass(event, eventClass)
      : event.classes.length === 0 && isStartListAvailable(event)
  const isNumbersPublished = (eventClass?: ConfirmedEvent['classes'][number]) =>
    eventClass
      ? isStartNumbersAvailableForClass(event, eventClass)
      : event.classes.length === 0 && isStartNumbersAvailable(event)
  const startListFullyPublished =
    event.classes.length === 0
      ? isStartListPublished()
      : event.classes.every((eventClass) => isStartListPublished(eventClass))

  const handleSetStartListPublished = async (eventClass: RegistrationClass | undefined, published: boolean) => {
    const state = eventClass ? (stateByClass[eventClass] ?? event.state) : event.state
    if (!canPublishStartList(state, event) || !onSetStartListPublished) return

    try {
      await onSetStartListPublished(eventClass, published)
      enqueueSnackbar(t(getStartListAuditMessageKey(eventClass, published), { eventClass }), { variant: 'success' })
    } catch {
      enqueueSnackbar(t('eventManagement.startList.saveFailed'), errorSnackbarOptions)
    }
  }

  const handleSetStartNumbersPublished = async (eventClass: RegistrationClass | undefined, published: boolean) => {
    if (!onSetStartNumbersPublished) return

    try {
      await onSetStartNumbersPublished(eventClass, published)
      enqueueSnackbar(t(getStartNumbersAuditMessageKey(eventClass, published), { eventClass }), { variant: 'success' })
    } catch {
      enqueueSnackbar(t('eventManagement.startList.saveFailed'), errorSnackbarOptions)
    }
  }

  return (
    <Box sx={sectionSx}>
      <Typography variant="overline" color="text.secondary" sx={{ display: 'block', pt: 1, px: 1.5 }}>
        {t('eventManagement.startList.publishing')}
      </Typography>
      <TableContainer>
        <Table>
          <TableBody>
            {Object.entries(numbersByClass).map(([className]) => {
              const selected = selectedByClass[className] ?? []
              const invitationsSent =
                selected.length > 0 && getInvitationRecipients(eventWithCurrentAttachments, selected).length === 0
              const classState = stateByClass[className] ?? event.state
              const startListPublished = isStartListPublished(
                event.classes.find((eventClass) => eventClass.class === className)
              )
              const classlessEventRow = event.classes.length === 0 && className === event.eventType
              const startListEventClass = isRegistrationClass(className) ? className : undefined
              // A finished event deliberately does not disable this. Publishing the list is what carries
              // the results to the public, and results are entered after the dogs have run — unlike
              // picking participants or sending invitations, which a finished event should not reopen.
              const startListManageable =
                Boolean(onSetStartListPublished) &&
                (classlessEventRow || Boolean(startListEventClass)) &&
                canPublishStartList(classState, event)
              const canManageStartList = invitationsSent && startListManageable
              const numbersPublished = isNumbersPublished(
                event.classes.find((eventClass) => eventClass.class === className)
              )
              // Numbers can only be public on a published list, so the button waits for the list.
              const canManageStartNumbers =
                Boolean(onSetStartNumbersPublished) && startListManageable && startListPublished

              return (
                <TableRow key={className}>
                  <TableCell align="left">
                    <Box ml={2}>
                      <Typography variant="caption" noWrap fontWeight="bold">
                        {className}
                      </Typography>
                      {startListPublished && (
                        <Typography variant="caption" color="info.main" display="block">
                          {t('eventManagement.startList.published')}
                        </Typography>
                      )}
                      {startListPublished && numbersPublished && (
                        <Typography variant="caption" color="info.main" display="block">
                          {t('eventManagement.startList.numbersPublished')}
                        </Typography>
                      )}
                    </Box>
                  </TableCell>
                  <TableCell align="right">
                    <Stack direction="row" flexWrap="wrap" justifyContent="flex-end" spacing={1} useFlexGap>
                      <Button
                        size="small"
                        disabled={!canManageStartList}
                        onClick={() => {
                          if (classlessEventRow || startListEventClass) {
                            handleSetStartListPublished(startListEventClass, !startListPublished)
                          }
                        }}
                        color={startListPublished ? 'secondary' : 'primary'}
                        variant={canManageStartList ? 'contained' : 'outlined'}
                      >
                        {t(startListPublished ? 'eventManagement.startList.hide' : 'eventManagement.startList.publish')}
                      </Button>
                      <Button
                        size="small"
                        disabled={!canManageStartNumbers}
                        onClick={() => {
                          if (classlessEventRow || startListEventClass) {
                            handleSetStartNumbersPublished(startListEventClass, !numbersPublished)
                          }
                        }}
                        color={numbersPublished ? 'secondary' : 'primary'}
                        variant={canManageStartNumbers ? 'contained' : 'outlined'}
                      >
                        {t(
                          numbersPublished
                            ? 'eventManagement.startList.hideNumbers'
                            : 'eventManagement.startList.publishNumbers'
                        )}
                      </Button>
                    </Stack>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </TableContainer>
      <Box sx={{ pb: 1, pt: 0.5, px: 1 }}>
        <Button
          fullWidth
          href={Path.admin.startListPreview(event.id)}
          startIcon={<FormatListNumberedOutlined />}
          sx={actionButtonSx}
          target="_blank"
          variant="outlined"
        >
          {t(
            startListFullyPublished
              ? 'eventManagement.startList.preview'
              : 'eventManagement.startList.previewUnpublished'
          )}
        </Button>
      </Box>
    </Box>
  )
}

export default StartListPublishing
