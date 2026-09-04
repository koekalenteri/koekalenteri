import type useAdminEventRegistrationInfo from '../../../../hooks/useAdminEventRegistrationsInfo'
import type { ConfirmedEvent, RegistrationClass } from '../../../../types'
import FormatListNumberedOutlined from '@mui/icons-material/FormatListNumberedOutlined'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Stack from '@mui/material/Stack'
import TableCell from '@mui/material/TableCell'
import TableRow from '@mui/material/TableRow'
import Typography from '@mui/material/Typography'
import { enqueueSnackbar } from 'notistack'
import { useTranslation } from 'react-i18next'
import { errorSnackbarOptions } from '../../../../lib/client/snackbar'
import { canPublishStartList } from '../../../../lib/event'
import { Path } from '../../../../routeConfig'
import { PublishingSection } from './PublishingSection'
import {
  getPublishingRows,
  isPublishedForEveryClass,
  isStartListPublished,
  isStartNumbersPublished,
} from './publishingRow'
import { actionButtonSx } from './styles'

type RegistrationInfo = ReturnType<typeof useAdminEventRegistrationInfo>

const getStartListAuditMessageKey = (eventClass: RegistrationClass | undefined, published: boolean) => {
  if (eventClass) return published ? 'audit.messages.classStartListPublished' : 'audit.messages.classStartListHidden'
  return published ? 'audit.messages.startListPublished' : 'audit.messages.startListHidden'
}

interface Props {
  readonly event: ConfirmedEvent
  readonly eventWithCurrentAttachments: ConfirmedEvent
  readonly numbersByClass: RegistrationInfo['numbersByClass']
  readonly onSetStartListPublished?: (eventClass: RegistrationClass | undefined, published: boolean) => Promise<unknown>
  readonly selectedByClass: RegistrationInfo['selectedByClass']
  readonly stateByClass: RegistrationInfo['stateByClass']
}

const StartListPublishing = ({
  event,
  eventWithCurrentAttachments,
  numbersByClass,
  onSetStartListPublished,
  selectedByClass,
  stateByClass,
}: Props) => {
  const { t } = useTranslation()
  const startListFullyPublished = isPublishedForEveryClass(event, isStartListPublished)
  // With numbers still withheld the secretary sees more than the public does, so the link is a preview.
  const startNumbersFullyPublished = isPublishedForEveryClass(event, isStartNumbersPublished)

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

  const rows = getPublishingRows({ event, eventWithCurrentAttachments, selectedByClass, stateByClass }, numbersByClass)

  return (
    <PublishingSection
      title={t('eventManagement.startList.publishing')}
      action={
        /* The numbers are a column of this list, so the one preview belongs here (KOE-1297). */
        <Button
          fullWidth
          href={Path.admin.startListPreview(event.id)}
          startIcon={<FormatListNumberedOutlined />}
          sx={actionButtonSx}
          target="_blank"
          variant="outlined"
        >
          {t(
            startListFullyPublished && startNumbersFullyPublished
              ? 'eventManagement.startList.preview'
              : 'eventManagement.startList.previewUnpublished'
          )}
        </Button>
      }
    >
      {rows.map((row) => {
        const { className, publishable, startListEventClass, startListPublished } = row
        // A finished event deliberately does not disable this. Publishing the list is what carries
        // the results to the public, and results are entered after the dogs have run — unlike
        // picking participants or sending invitations, which a finished event should not reopen.
        const canManageStartList = Boolean(onSetStartListPublished) && row.manageable && row.invitationsSent
        // A dead button with no reason beside it is the thing this whole step reads as broken
        // (KOE-1313). Publishing waits on the invitations, and those wait on the participants
        // being picked, so name whichever of the two is still outstanding.
        const blockedReasonKey = row.participantsPicked
          ? 'eventManagement.startList.invitationsRequired'
          : 'eventManagement.startList.participantsRequired'

        return (
          <TableRow key={className}>
            <TableCell align="left">
              <Box ml={2}>
                <Typography variant="caption" noWrap fontWeight="bold">
                  {className}
                </Typography>
                {startListPublished && (
                  <Typography variant="caption" color="info.main" display="block" noWrap>
                    {t('eventManagement.startList.published')}
                  </Typography>
                )}
                {!startListPublished && !canManageStartList && Boolean(onSetStartListPublished) && (
                  <Typography variant="caption" color="text.secondary" display="block" noWrap>
                    {t(blockedReasonKey)}
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
                    if (publishable) handleSetStartListPublished(startListEventClass, !startListPublished)
                  }}
                  color={startListPublished ? 'secondary' : 'primary'}
                  variant={canManageStartList ? 'contained' : 'outlined'}
                >
                  {t(startListPublished ? 'eventManagement.startList.hide' : 'eventManagement.startList.publish')}
                </Button>
              </Stack>
            </TableCell>
          </TableRow>
        )
      })}
    </PublishingSection>
  )
}

export default StartListPublishing
