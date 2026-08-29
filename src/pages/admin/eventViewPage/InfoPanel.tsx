import type { ChangeEvent } from 'react'
import type { AuditRecord, ConfirmedEvent, EmailTemplateId, Registration, RegistrationClass } from '../../../types'
import KeyboardArrowRight from '@mui/icons-material/KeyboardArrowRight'
import MenuOpen from '@mui/icons-material/MenuOpen'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import Drawer from '@mui/material/Drawer'
import IconButton from '@mui/material/IconButton'
import Tab from '@mui/material/Tab'
import Tabs from '@mui/material/Tabs'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import { useAtomValue, useSetAtom } from 'jotai'
import { enqueueSnackbar } from 'notistack'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { getEventAuditTrail, putInvitationAttachment } from '../../../api/event'
import { APIError } from '../../../api/http'
import useAdminEventRegistrationInfo from '../../../hooks/useAdminEventRegistrationsInfo'
import { mergeAuditTrail, useAuditTrailSubscription } from '../../../hooks/useAuditTrailSubscription'
import { reportError } from '../../../lib/client/error'
import { errorSnackbarOptions } from '../../../lib/client/snackbar'
import { hasEntryEnded, isEventOngoing, isEventOver } from '../../../lib/event'
import { invitationAttachmentFileName } from '../../../lib/fileName'
import { validIdTokenAtom } from '../../state'
import { AuditTrail } from '../components/AuditTrail'
import { adminEventAtom } from '../state'
import EventActions from './infoPanel/EventActions'
import InvitationDelivery from './infoPanel/InvitationDelivery'
import ParticipantSelection from './infoPanel/ParticipantSelection'
import StartListPublishing from './infoPanel/StartListPublishing'
import { sectionSx } from './infoPanel/styles'

interface Props {
  readonly event: ConfirmedEvent
  readonly onCreateRegistration?: () => void
  readonly onOpenDetails?: () => void
  readonly onSetStartListPublished?: (eventClass: RegistrationClass | undefined, published: boolean) => Promise<unknown>
  readonly registrations: Registration[]
  readonly onOpenMessageDialog?: (recipients: Registration[], templateId?: EmailTemplateId) => void
}

const APP_HEADER_HEIGHT = 36

const InfoPanel = ({
  event,
  onCreateRegistration,
  onOpenDetails,
  onSetStartListPublished,
  registrations,
  onOpenMessageDialog,
}: Props) => {
  const { t } = useTranslation()
  const token = useAtomValue(validIdTokenAtom)
  const [attachmentKey, setAttachmentKey] = useState(event.invitationAttachment)
  const [classAttachmentKeys, setClassAttachmentKeys] = useState(event.invitationAttachments ?? {})
  const [attachmentHistory, setAttachmentHistory] = useState(event.invitationAttachmentHistory ?? {})
  const [auditTrail, setAuditTrail] = useState<AuditRecord[]>([])
  const [auditTrailLoading, setAuditTrailLoading] = useState(false)
  const [activeTab, setActiveTab] = useState(0)
  const setEvent = useSetAtom(adminEventAtom(event.id))
  const [expanded, setExpanded] = useState(false)
  useAuditTrailSubscription(`event:${event.id}`, expanded, setAuditTrail)
  const { reserveByClass, numbersByClass, selectedByClass, stateByClass } = useAdminEventRegistrationInfo(
    event,
    registrations
  )
  const entryEnded = hasEntryEnded(event)
  const eventFinished = isEventOver(event)
  // Nothing to score until the dogs are running.
  const eventStarted = eventFinished || isEventOngoing(event)
  const eventWithCurrentAttachments = useMemo(
    () => ({ ...event, invitationAttachment: attachmentKey, invitationAttachments: classAttachmentKeys }),
    [attachmentKey, classAttachmentKeys, event]
  )
  const toggle = useCallback(() => setExpanded((old) => !old), [])

  const handleInvitationUpload = useCallback(
    (className?: RegistrationClass) => async (changeEvent: ChangeEvent<HTMLInputElement>) => {
      const input = changeEvent.target
      if (eventFinished) return

      if (!input.files) {
        console.log('no files')
        return
      }

      try {
        const { invitationAttachmentHistory, key: fileKey } = await putInvitationAttachment(
          event.id,
          input.files[0],
          className,
          token
        )
        setAttachmentHistory(invitationAttachmentHistory)

        if (className) {
          const classEvent = event.classes.find((item) => item.class === className)
          const fileName = invitationAttachmentFileName({
            ...event,
            class: className,
            invitationAttachment: fileKey,
            startDate: classEvent?.date ?? event.startDate,
          })
          const invitationAttachments = { ...classAttachmentKeys, [className]: fileKey }
          setClassAttachmentKeys(invitationAttachments)
          setEvent({ ...event, invitationAttachmentHistory, invitationAttachments })
          enqueueSnackbar(
            t(
              event.invitationAttachments?.[className]
                ? 'eventManagement.upload.classUpdated'
                : 'eventManagement.upload.classAttached',
              { eventClass: className, fileName }
            ),
            { variant: 'success' }
          )
        } else {
          const update = Boolean(event.invitationAttachment)
          const fileName = invitationAttachmentFileName({ ...event, invitationAttachment: fileKey })
          setAttachmentKey(fileKey)
          setEvent({ ...event, invitationAttachment: fileKey, invitationAttachmentHistory })
          enqueueSnackbar(
            t(update ? 'eventManagement.upload.updated' : 'eventManagement.upload.attached', { fileName }),
            {
              variant: 'success',
            }
          )
        }
      } catch (error) {
        if (error instanceof APIError && error.status === 413) {
          enqueueSnackbar(t('eventManagement.upload.attachmentTooLarge'), errorSnackbarOptions)
          return
        }
        enqueueSnackbar(t('eventManagement.upload.attachmentFailed'), errorSnackbarOptions)
      } finally {
        input.value = ''
      }
    },
    [classAttachmentKeys, event, eventFinished, setEvent, t, token]
  )

  useEffect(() => {
    setAttachmentKey(event.invitationAttachment)
    setClassAttachmentKeys(event.invitationAttachments ?? {})
    setAttachmentHistory(event.invitationAttachmentHistory ?? {})
  }, [event.invitationAttachment, event.invitationAttachmentHistory, event.invitationAttachments])

  useEffect(() => {
    if (!expanded || activeTab !== 1 || !token) return
    setAuditTrailLoading(true)
    setAuditTrail([])
    getEventAuditTrail(event.id, token)
      .then((trail) => setAuditTrail((current) => mergeAuditTrail(trail ?? [], current)))
      .catch((error) => {
        reportError(error)
        setAuditTrail([])
      })
      .finally(() => setAuditTrailLoading(false))
  }, [activeTab, event.id, expanded, token])

  if (!expanded) {
    return (
      <Button
        aria-label={t('eventManagement.open')}
        onClick={toggle}
        startIcon={<MenuOpen fontSize="small" />}
        sx={{
          '& .MuiButton-startIcon': { m: 0 },
          alignItems: 'center',
          borderBottomRightRadius: 0,
          borderTopRightRadius: 0,
          boxShadow: 3,
          flexDirection: 'row',
          gap: 0.75,
          minWidth: 36,
          position: 'fixed',
          px: 0.75,
          py: 1.25,
          right: 0,
          top: APP_HEADER_HEIGHT + 12,
          writingMode: 'vertical-rl',
          zIndex: (theme) => theme.zIndex.drawer,
        }}
        variant="contained"
      >
        {t('eventManagement.tabs.management')}
      </Button>
    )
  }

  return (
    <Drawer
      anchor="right"
      onClose={() => setExpanded(false)}
      open={expanded}
      variant="temporary"
      slotProps={{
        backdrop: { sx: { backgroundColor: 'transparent' } },
        paper: {
          sx: {
            border: '1px solid',
            borderColor: 'divider',
            boxShadow: 6,
            display: 'flex',
            flexDirection: 'column',
            height: `calc(100% - ${APP_HEADER_HEIGHT}px)`,
            overflow: 'hidden',
            top: APP_HEADER_HEIGHT,
            width: 'min(480px, calc(100vw - 16px))',
          },
        },
      }}
    >
      <Box
        sx={{
          '& .MuiTableContainer-root': { '& .MuiTableCell-root': { px: 1, py: 0.5 }, width: '100%' },
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
          minHeight: 0,
        }}
      >
        <Box sx={{ alignItems: 'center', display: 'flex', pl: 1.5 }}>
          <Tabs
            aria-label={t('eventManagement.tabs.ariaLabel')}
            onChange={(_, value: number) => setActiveTab(value)}
            sx={{ flex: 1 }}
            value={activeTab}
          >
            <Tab label={t('eventManagement.tabs.management')} />
            <Tab label={t('eventManagement.tabs.auditTrail')} />
          </Tabs>
          <Box sx={{ pr: 1.5 }}>
            <Tooltip title={t('eventManagement.close')}>
              <IconButton size="small" color="primary" onClick={toggle} aria-label={t('eventManagement.close')}>
                <KeyboardArrowRight />
              </IconButton>
            </Tooltip>
          </Box>
        </Box>

        <Box
          data-testid="info-panel-content"
          sx={{
            alignContent: 'start',
            display: activeTab === 0 ? 'grid' : 'none',
            flex: 1,
            gap: 1.5,
            gridAutoRows: 'max-content',
            minHeight: 0,
            overflowY: 'auto',
            overscrollBehavior: 'contain',
            p: 1.5,
            scrollbarGutter: 'stable',
          }}
        >
          {event.kcId !== undefined && (
            <Box sx={sectionSx}>
              <Typography variant="overline" color="text.secondary" sx={{ display: 'block', pt: 1, px: 1.5 }}>
                Kokeen tiedot
              </Typography>
              <Box sx={{ display: 'flex', gap: 2, px: 2.5, py: 1 }}>
                <Typography variant="caption" fontWeight="bold">
                  Koetunnus
                </Typography>
                <Typography variant="caption">{event.kcId}</Typography>
              </Box>
            </Box>
          )}
          <ParticipantSelection
            entryEnded={entryEnded}
            event={event}
            eventFinished={eventFinished}
            numbersByClass={numbersByClass}
            onOpenMessageDialog={onOpenMessageDialog}
            reserveByClass={reserveByClass}
            selectedByClass={selectedByClass}
            stateByClass={stateByClass}
          />
          <InvitationDelivery
            attachmentHistory={attachmentHistory}
            attachmentKey={attachmentKey}
            classAttachmentKeys={classAttachmentKeys}
            entryEnded={entryEnded}
            event={event}
            eventFinished={eventFinished}
            numbersByClass={numbersByClass}
            onOpenMessageDialog={onOpenMessageDialog}
            onUpload={handleInvitationUpload}
            selectedByClass={selectedByClass}
            stateByClass={stateByClass}
          />
          <StartListPublishing
            event={event}
            eventFinished={eventFinished}
            eventWithCurrentAttachments={eventWithCurrentAttachments}
            numbersByClass={numbersByClass}
            onSetStartListPublished={onSetStartListPublished}
            selectedByClass={selectedByClass}
            stateByClass={stateByClass}
          />
          <EventActions
            eventFinished={eventFinished}
            eventId={event.id}
            eventStarted={eventStarted}
            eventType={event.eventType}
            onCreateRegistration={onCreateRegistration}
            onOpenDetails={onOpenDetails}
          />
        </Box>
        <Box sx={{ display: activeTab === 1 ? 'flex' : 'none', flex: 1, minHeight: 0, p: 1.5 }}>
          {auditTrailLoading ? (
            <CircularProgress sx={{ m: 'auto' }} />
          ) : (
            <AuditTrail auditTrail={auditTrail} fullHeight />
          )}
        </Box>
      </Box>
    </Drawer>
  )
}

export default InfoPanel
