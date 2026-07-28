import type useAdminEventRegistrationInfo from '../../../../hooks/useAdminEventRegistrationsInfo'
import type { ConfirmedEvent, RegistrationClass } from '../../../../types'
import FormatListNumberedOutlined from '@mui/icons-material/FormatListNumberedOutlined'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableContainer from '@mui/material/TableContainer'
import TableRow from '@mui/material/TableRow'
import Typography from '@mui/material/Typography'
import { enqueueSnackbar } from 'notistack'
import { useTranslation } from 'react-i18next'
import { canPublishStartList, isStartListPublishedForClass } from '../../../../lib/event'
import { getInvitationRecipients, isRegistrationClass } from '../../../../lib/registration'
import { errorSnackbarOptions } from '../../../../lib/snackbar'
import { Path } from '../../../../routeConfig'
import { actionButtonSx, sectionSx } from './styles'

type RegistrationInfo = ReturnType<typeof useAdminEventRegistrationInfo>

const getStartListAuditMessageKey = (eventClass: RegistrationClass | undefined, published: boolean) => {
  if (eventClass) return published ? 'audit.messages.classStartListPublished' : 'audit.messages.classStartListHidden'
  return published ? 'audit.messages.startListPublished' : 'audit.messages.startListHidden'
}

interface Props {
  readonly event: ConfirmedEvent
  readonly eventFinished: boolean
  readonly eventWithCurrentAttachments: ConfirmedEvent
  readonly numbersByClass: RegistrationInfo['numbersByClass']
  readonly onSetStartListPublished?: (eventClass: RegistrationClass | undefined, published: boolean) => Promise<unknown>
  readonly selectedByClass: RegistrationInfo['selectedByClass']
  readonly stateByClass: RegistrationInfo['stateByClass']
}

const StartListPublishing = ({
  event,
  eventFinished,
  eventWithCurrentAttachments,
  numbersByClass,
  onSetStartListPublished,
  selectedByClass,
  stateByClass,
}: Props) => {
  const { t } = useTranslation()

  const handleSetStartListPublished = async (eventClass: RegistrationClass | undefined, published: boolean) => {
    const state = eventClass ? (stateByClass[eventClass] ?? event.state) : event.state
    if (eventFinished || !canPublishStartList(state) || !onSetStartListPublished) return

    try {
      await onSetStartListPublished(eventClass, published)
      enqueueSnackbar(t(getStartListAuditMessageKey(eventClass, published), { eventClass }), { variant: 'success' })
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
              const classFinished = eventFinished || ['ended', 'completed'].includes(classState)
              const startListPublished = isStartListPublishedForClass(event, className)
              const classlessEventRow = event.classes.length === 0 && className === event.eventType
              const startListEventClass = isRegistrationClass(className) ? className : undefined
              const startListManageable =
                Boolean(onSetStartListPublished) &&
                !classFinished &&
                (classlessEventRow || Boolean(startListEventClass)) &&
                canPublishStartList(classState)
              const canManageStartList = invitationsSent && startListManageable

              return (
                <TableRow key={className}>
                  <TableCell align="left">
                    <Typography variant="caption" noWrap fontWeight="bold" ml={2}>
                      {className}
                    </Typography>
                  </TableCell>
                  <TableCell align="right">
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
          {t('eventManagement.startList.preview')}
        </Button>
      </Box>
    </Box>
  )
}

export default StartListPublishing
