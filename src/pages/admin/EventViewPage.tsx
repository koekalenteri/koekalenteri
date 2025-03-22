import type { EmailTemplateId, Registration, RegistrationClass } from '../../types'

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useParams } from 'react-router'
import AddCircleOutline from '@mui/icons-material/AddCircleOutline'
import EditOutlined from '@mui/icons-material/EditOutlined'
import EmailOutlined from '@mui/icons-material/EmailOutlined'
import FormatListBulleted from '@mui/icons-material/FormatListBulleted'
import FormatListNumberedOutlined from '@mui/icons-material/FormatListNumberedOutlined'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import Divider from '@mui/material/Divider'
import Grid2 from '@mui/material/Grid2'
import Modal from '@mui/material/Modal'
import Stack from '@mui/material/Stack'
import Tab from '@mui/material/Tab'
import Tabs from '@mui/material/Tabs'
import { useRecoilState, useRecoilValue } from 'recoil'

import useAdminEventRegistrationInfo from '../../hooks/useAdminEventRegistrationsInfo'
import { getRegistrationGroupKey, GROUP_KEY_CANCELLED } from '../../lib/registration'
import { Path } from '../../routeConfig'
import CancelDialog from '../components/CancelDialog'
import LoadingIndicator from '../components/LoadingIndicator'

import FullPageFlex from './components/FullPageFlex'
import ClassEntrySelection from './eventViewPage/ClassEntrySelection'
import EventDetailsDialog from './eventViewPage/EventDetailsDialog'
import InfoPanel from './eventViewPage/InfoPanel'
import { RefundDailog } from './eventViewPage/RefundDialog'
import RegistrationCreateDialog from './eventViewPage/RegistrationCreateDialog'
import RegistrationEditDialog from './eventViewPage/RegistrationEditDialog'
import SendMessageDialog from './eventViewPage/SendMessageDialog'
import TabPanel from './eventViewPage/TabPanel'
import Title from './eventViewPage/Title'
import { useAdminRegistrationActions } from './recoil/registrations/actions'
import {
  adminBackgroundActionsRunningAtom,
  adminEventClassAtom,
  adminEventRegistrationsSelector,
  adminEventSelector,
  adminRegistrationIdAtom,
} from './recoil'

const REG_CLASSES = ['ALO', 'AVO', 'VOI']

export const isRegistrationClass = (cls?: string | null): cls is RegistrationClass =>
  !!(cls && REG_CLASSES.includes(cls))

export default function EventViewPage() {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [msgDlgOpen, setMsgDlgOpen] = useState(false)
  const [refundOpen, setRefundOpen] = useState(false)
  const [cancelOpen, setCancelOpen] = useState(false)

  const params = useParams()
  const eventId = params.id ?? ''
  const event = useRecoilValue(adminEventSelector(eventId))
  const actions = useAdminRegistrationActions(eventId)

  const [selectedEventClass, setSelectedEventClass] = useRecoilState(adminEventClassAtom)
  const [selectedRegistrationId, setSelectedRegistrationId] = useRecoilState(adminRegistrationIdAtom)
  const allRegistrations = useRecoilValue(adminEventRegistrationsSelector(eventId))
  const registrations = useMemo(
    () =>
      allRegistrations.filter(
        (r) => (r.class ?? undefined) === selectedEventClass || (!r.class && r.eventType === selectedEventClass)
      ),
    [allRegistrations, selectedEventClass]
  )
  const selectedRegistration = useMemo(
    () => selectedRegistrationId && registrations.find((r) => r.id === selectedRegistrationId),
    [registrations, selectedRegistrationId]
  )
  const [recipientRegistrations, setRecipientRegistrations] = useState<Registration[]>([])
  const [messageTemplateId, setMessageTemplateId] = useState<EmailTemplateId>()
  const { eventClasses, stateByClass, missingClasses } = useAdminEventRegistrationInfo(event, allRegistrations)
  const allClasses = useMemo(() => eventClasses.concat(missingClasses), [eventClasses, missingClasses])
  const backgroundActionsRunning = useRecoilValue(adminBackgroundActionsRunningAtom)

  const activeTab = useMemo(
    () => Math.max(allClasses.findIndex((c) => c === selectedEventClass) ?? 0, 0),
    [allClasses, selectedEventClass]
  )

  const handleTabChange = useCallback(
    (_: React.SyntheticEvent, newValue: number) => {
      setSelectedEventClass(allClasses[newValue])
    },
    [allClasses, setSelectedEventClass]
  )

  const handleClose = useCallback(() => setOpen(false), [])
  const handleCancelClose = useCallback(() => setCancelOpen(false), [])
  const handleCreateClose = useCallback(() => setCreateOpen(false), [])
  const handleDetailsClose = useCallback(() => setDetailsOpen(false), [])
  const handleRefundClose = useCallback(() => setRefundOpen(false), [])
  const closeMsgDlg = useCallback(() => setMsgDlgOpen(false), [])

  const handleOpenMsgDialog = (recipients: Registration[], templateId?: EmailTemplateId) => {
    setRecipientRegistrations(recipients)
    setMessageTemplateId(templateId)
    setMsgDlgOpen(true)
  }

  const handleCancel = useCallback(
    async (reason: string) => {
      if (!selectedRegistration) return
      const regs = registrations.filter(
        (r) => getRegistrationGroupKey(r) === GROUP_KEY_CANCELLED && r.id !== selectedRegistration.id
      )
      setCancelOpen(false)
      await actions.cancel(selectedRegistration.eventId, selectedRegistration.id, reason, regs.length + 1)
    },
    [actions, registrations, selectedRegistration]
  )

  useEffect(() => {
    if (selectedEventClass && !allClasses.includes(selectedEventClass)) {
      setSelectedEventClass(allClasses[0])
    }
  }, [allClasses, selectedEventClass, setSelectedEventClass])

  if (!event) {
    return <>duh</>
  }

  return (
    <>
      <FullPageFlex minWidth={900}>
        <Grid2 container justifyContent="end">
          <Grid2 flexGrow={1}>
            <Title event={event} />
          </Grid2>
          <Grid2>
            <InfoPanel event={event} registrations={allRegistrations} onOpenMessageDialog={handleOpenMsgDialog} />
          </Grid2>
        </Grid2>

        <Stack direction="row" spacing={2}>
          <Button startIcon={<FormatListBulleted />} onClick={() => setDetailsOpen(true)}>
            Näytä tapahtuman tiedot
          </Button>
          <Button
            startIcon={<EmailOutlined />}
            onClick={() => handleOpenMsgDialog(selectedRegistration ? [selectedRegistration] : [])}
          >
            Lähetä viesti
          </Button>
          <Divider orientation="vertical"></Divider>
          <Button startIcon={<FormatListNumberedOutlined />} href={Path.admin.startList(eventId)} target="_blank">
            Katso sihteerin starttilista
          </Button>
          <Divider orientation="vertical"></Divider>
          <Button
            startIcon={<AddCircleOutline />}
            onClick={() => {
              setCreateOpen(true)
            }}
          >
            {t('createRegistration')}
          </Button>
          <Button
            startIcon={<EditOutlined />}
            disabled={!selectedRegistrationId}
            onClick={() => {
              setOpen(true)
            }}
          >
            {t('editRegistration')}
          </Button>
        </Stack>

        <Box sx={{ borderBottom: 1, borderColor: 'divider', mr: 2 }}>
          <Stack direction="row" alignItems="center" justifyContent="space-between">
            <Tabs value={activeTab} onChange={handleTabChange}>
              {allClasses.map((eventClass) => (
                <Tab
                  key={`tab-${eventClass}`}
                  id={`tab-${eventClass}`}
                  sx={{
                    borderLeft: '1px solid',
                    borderLeftColor: 'divider',
                    bgcolor: missingClasses.includes(eventClass) ? '#fdeded' : undefined,
                  }}
                  label={eventClass}
                ></Tab>
              ))}
            </Tabs>
            <CircularProgress
              size={20}
              color="info"
              sx={{ opacity: backgroundActionsRunning ? 1 : 0, transition: 'opacity 0.1s ease-in-out' }}
            />
          </Stack>
        </Box>

        <Box
          sx={{
            display: 'flex',
            flexGrow: 1,
            width: '100%',
            height: '100%',
            maxHeight: '70vh',
          }}
        >
          {allClasses.map((eventClass, index) => (
            <TabPanel key={`tabPanel-${eventClass}`} index={index} activeTab={activeTab}>
              {missingClasses.includes(eventClass) ? (
                <Alert severity="info" sx={{ m: 1 }}>
                  Nämä ilmoittautumiset ovat koeluokassa, jota ei enää ole kokeessa. Ilmoittautumisten luokat täytyy
                  korjata.
                </Alert>
              ) : null}
              <ClassEntrySelection
                event={event}
                eventClass={eventClass}
                registrations={registrations}
                setOpen={setOpen}
                setCancelOpen={setCancelOpen}
                setRefundOpen={setRefundOpen}
                selectedRegistrationId={selectedRegistrationId}
                setSelectedRegistrationId={setSelectedRegistrationId}
                state={stateByClass[eventClass]}
              />
            </TabPanel>
          ))}
        </Box>
      </FullPageFlex>
      <Suspense
        fallback={
          <Modal open>
            <>
              <LoadingIndicator />
            </>
          </Modal>
        }
      >
        <RegistrationEditDialog
          event={event}
          onClose={handleClose}
          open={open}
          registrationId={open ? (selectedRegistrationId ?? '') : ''}
        />
        <RegistrationCreateDialog
          event={event}
          eventClass={
            isRegistrationClass(selectedEventClass) && eventClasses.includes(selectedEventClass)
              ? selectedEventClass
              : undefined
          }
          onClose={handleCreateClose}
          open={createOpen}
        />
        <SendMessageDialog
          event={event}
          onClose={closeMsgDlg}
          open={msgDlgOpen}
          registrations={recipientRegistrations}
          templateId={messageTemplateId}
        />
        <EventDetailsDialog eventId={eventId} open={detailsOpen} onClose={handleDetailsClose} />
        {selectedRegistration && (
          <RefundDailog registration={selectedRegistration} open={refundOpen} onClose={handleRefundClose} />
        )}
        {selectedRegistration && (
          <CancelDialog
            event={event}
            open={cancelOpen}
            onClose={handleCancelClose}
            onCancel={handleCancel}
            registration={selectedRegistration}
          />
        )}
      </Suspense>
    </>
  )
}
