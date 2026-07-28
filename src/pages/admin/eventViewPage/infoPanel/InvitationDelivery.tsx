import type { ChangeEvent } from 'react'
import type useAdminEventRegistrationInfo from '../../../../hooks/useAdminEventRegistrationsInfo'
import type {
  ConfirmedEvent,
  EmailTemplateId,
  InvitationAttachmentVersion,
  Registration,
  RegistrationClass,
} from '../../../../types'
import PictureAsPdfOutlined from '@mui/icons-material/PictureAsPdfOutlined'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Link from '@mui/material/Link'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableContainer from '@mui/material/TableContainer'
import TableRow from '@mui/material/TableRow'
import Typography from '@mui/material/Typography'
import { Fragment } from 'react'
import { useTranslation } from 'react-i18next'
import { invitationAttachmentFileName } from '../../../../lib/fileName'
import { getInvitationRecipients, isRegistrationClass } from '../../../../lib/registration'
import { Path } from '../../../../routeConfig'
import { sectionSx } from './styles'

type RegistrationInfo = ReturnType<typeof useAdminEventRegistrationInfo>

interface AttachmentFile {
  readonly href: string
  readonly name: string
  readonly updatedAt?: Date
}

interface InvitationAttachmentFileProps {
  readonly file?: AttachmentFile
  readonly previousFiles: AttachmentFile[]
}

const InvitationAttachmentFile = ({ file, previousFiles }: InvitationAttachmentFileProps) => {
  const { t } = useTranslation()

  if (!file) {
    return (
      <Typography variant="caption" fontStyle="italic">
        {t('eventManagement.attachment.noFile')}
      </Typography>
    )
  }

  return (
    <Box>
      <Box>
        <PictureAsPdfOutlined fontSize="small" sx={{ pr: 0.5, verticalAlign: 'middle' }} />
        <Link href={file.href} rel="noopener" target="_blank" type="application/pdf" variant="caption">
          {file.name}
        </Link>
      </Box>
      {file.updatedAt && (
        <Typography color="text.secondary" display="block" variant="caption">
          {t('eventManagement.attachment.updated', { date: file.updatedAt })}
        </Typography>
      )}
      {previousFiles.length > 0 && (
        <Box sx={{ pt: 0.5 }}>
          <Typography color="text.secondary" display="block" variant="caption">
            {t('eventManagement.attachment.previouslySentPdfs')}
          </Typography>
          {previousFiles.map((previousFile) => (
            <Box key={previousFile.href}>
              <Link href={previousFile.href} rel="noopener" target="_blank" type="application/pdf" variant="caption">
                {previousFile.updatedAt
                  ? t('eventManagement.attachment.date', { date: previousFile.updatedAt })
                  : previousFile.name}
              </Link>
            </Box>
          ))}
        </Box>
      )}
    </Box>
  )
}

interface InvitationAttachmentControlProps {
  readonly disabled: boolean
  readonly file?: AttachmentFile
  readonly inputId: string
  readonly onChange: (event: ChangeEvent<HTMLInputElement>) => void
}

const InvitationAttachmentControl = ({ disabled, file, inputId, onChange }: InvitationAttachmentControlProps) => {
  const { t } = useTranslation()

  return (
    <>
      <input accept="application/pdf" disabled={disabled} type="file" hidden id={inputId} onChange={onChange} />
      <label htmlFor={inputId}>
        <Button color="secondary" component="span" disabled={disabled} size="small" variant="contained">
          {file ? t('eventManagement.attachment.replacePdf') : t('eventManagement.attachment.addPdf')}
        </Button>
      </label>
    </>
  )
}

interface Props {
  readonly attachmentHistory: Record<string, InvitationAttachmentVersion>
  readonly attachmentKey?: string
  readonly classAttachmentKeys: Record<string, string>
  readonly entryEnded: boolean
  readonly event: ConfirmedEvent
  readonly eventFinished: boolean
  readonly numbersByClass: RegistrationInfo['numbersByClass']
  readonly onOpenMessageDialog?: (recipients: Registration[], templateId?: EmailTemplateId) => void
  readonly onUpload: (eventClass?: RegistrationClass) => (event: ChangeEvent<HTMLInputElement>) => void
  readonly selectedByClass: RegistrationInfo['selectedByClass']
  readonly stateByClass: RegistrationInfo['stateByClass']
}

const InvitationDelivery = ({
  attachmentHistory,
  attachmentKey,
  classAttachmentKeys,
  entryEnded,
  event,
  eventFinished,
  numbersByClass,
  onOpenMessageDialog,
  onUpload,
  selectedByClass,
  stateByClass,
}: Props) => {
  const { t } = useTranslation()
  const eventClasses = new Set(event.classes.map((eventClass) => eventClass.class))
  const eventWithCurrentAttachments = {
    ...event,
    invitationAttachment: attachmentKey,
    invitationAttachments: classAttachmentKeys,
  }

  return (
    <Box sx={sectionSx}>
      <Typography variant="overline" color="text.secondary" sx={{ display: 'block', pt: 1, px: 1.5 }}>
        {t('eventManagement.invitation.delivery')}
      </Typography>
      <TableContainer>
        <Table sx={{ '& .MuiTableCell-root': { overflowWrap: 'anywhere' }, tableLayout: 'fixed' }}>
          <TableBody>
            {Object.entries(numbersByClass).map(([className, numbers]) => {
              const selected = selectedByClass[className] ?? []
              const recipients = getInvitationRecipients(eventWithCurrentAttachments, selected)
              const invitationsSent = selected.length > 0 && recipients.length === 0
              const classState = stateByClass[className] ?? event.state
              const classFinished = eventFinished || ['ended', 'completed'].includes(classState)
              const canSend =
                entryEnded && !classFinished && ['picked', 'invited'].includes(classState) && recipients.length > 0
              const eventClass = isRegistrationClass(className) && eventClasses.has(className) ? className : undefined
              const classAttachmentKey = eventClass ? classAttachmentKeys[eventClass] : undefined
              const classEvent = eventClass ? event.classes.find((item) => item.class === eventClass) : undefined
              const effectiveAttachmentKey = classAttachmentKey ?? attachmentKey
              const classInvitationEvent = {
                ...event,
                ...(eventClass ? { class: eventClass } : {}),
                invitationAttachment: effectiveAttachmentKey,
                startDate: classEvent?.date ?? event.startDate,
              }
              const classAttachmentFile = effectiveAttachmentKey
                ? {
                    href: Path.invitationAttachment(classInvitationEvent),
                    name: invitationAttachmentFileName(classInvitationEvent),
                    updatedAt: attachmentHistory[effectiveAttachmentKey]?.uploadedAt,
                  }
                : undefined
              const previousAttachmentKeys = [
                ...new Set(
                  selected.flatMap(({ invitationAttachmentRead, invitationAttachmentSent }) => [
                    invitationAttachmentRead,
                    invitationAttachmentSent,
                  ])
                ),
              ].filter((key): key is string => Boolean(key && key !== effectiveAttachmentKey))
              const previousAttachmentFiles = previousAttachmentKeys.map((key) => {
                const previousInvitationEvent = { ...classInvitationEvent, invitationAttachment: key }
                return {
                  href: Path.invitationAttachment(previousInvitationEvent),
                  name: invitationAttachmentFileName(previousInvitationEvent),
                  updatedAt: attachmentHistory[key]?.uploadedAt,
                }
              })

              return (
                <Fragment key={className}>
                  <TableRow>
                    <TableCell colSpan={3} sx={{ borderBottom: 0, pb: 0 }}>
                      <Typography variant="caption" noWrap fontWeight="bold" ml={2}>
                        {eventClass ? t('eventManagement.invitation.class', { className: eventClass }) : className}
                      </Typography>
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell align="left" colSpan={2} sx={{ borderBottom: 0, pt: 0 }}>
                      <Box ml={2}>
                        <InvitationAttachmentFile file={classAttachmentFile} previousFiles={previousAttachmentFiles} />
                      </Box>
                    </TableCell>
                    <TableCell align="right" sx={{ borderBottom: 0 }}>
                      <InvitationAttachmentControl
                        disabled={classFinished}
                        file={classAttachmentFile}
                        inputId={eventClass ? `koekutsu-file-${eventClass}` : 'koekutsu-file'}
                        onChange={onUpload(eventClass)}
                      />
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell align="left" colSpan={2} sx={{ pt: eventClass ? 0 : undefined }}>
                      <Box ml={2}>
                        {invitationsSent && (
                          <Typography variant="caption" color="info.main">
                            {t('eventManagement.invitation.sent')}
                          </Typography>
                        )}
                        {!invitationsSent && classState === 'confirmed' && !classFinished && (
                          <Typography variant="caption" color="text.secondary">
                            {t('eventManagement.invitation.canSendAfterPicked')}
                          </Typography>
                        )}
                        {!invitationsSent && classState !== 'confirmed' && !entryEnded && !classFinished && (
                          <Typography variant="caption" color="text.secondary">
                            {t('eventManagement.invitation.canSendAfterEntry')}
                          </Typography>
                        )}
                      </Box>
                    </TableCell>
                    <TableCell align="right">
                      <Button
                        size="small"
                        disabled={numbers.participants === 0 || numbers.invalid || !canSend}
                        onClick={() => onOpenMessageDialog?.(recipients, 'invitation')}
                        color="primary"
                        variant={canSend && numbers.participants > 0 && !numbers.invalid ? 'contained' : 'outlined'}
                      >
                        {t('eventManagement.invitation.send')}
                      </Button>
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

export default InvitationDelivery
