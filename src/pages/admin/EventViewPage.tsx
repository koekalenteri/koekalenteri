import type { EmailTemplateId, Registration } from '../../types'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import CircularProgress from '@mui/material/CircularProgress'
import Modal from '@mui/material/Modal'
import Stack from '@mui/material/Stack'
import Tab from '@mui/material/Tab'
import Tabs from '@mui/material/Tabs'
import { useAtom, useAtomValue } from 'jotai'
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useParams } from 'react-router'
import useAdminEventRegistrationInfo from '../../hooks/useAdminEventRegistrationsInfo'
import { useEventSubscription } from '../../hooks/useEventSubscription'
import { reportError } from '../../lib/client/error'
import { hasSharedReserveList } from '../../lib/event'
import { getRegistrationClass, isRegistrationClass } from '../../lib/registration'
import CancelDialog from '../components/CancelDialog'
import LoadingIndicator from '../components/LoadingIndicator'
import EventNotFound from './components/EventNotFound'
import ClassEntrySelection from './eventViewPage/ClassEntrySelection'
import EventDetailsDialog from './eventViewPage/EventDetailsDialog'
import InfoPanel from './eventViewPage/InfoPanel'
import MessageRecipientsDialog from './eventViewPage/MessageRecipientsDialog'
import OtherViewers from './eventViewPage/OtherViewers'
import { RefundDailog } from './eventViewPage/RefundDialog'
import RegistrationCreateDialog from './eventViewPage/RegistrationCreateDialog'
import RegistrationEditDialog from './eventViewPage/RegistrationEditDialog'
import SendMessageDialog from './eventViewPage/SendMessageDialog'
import TabPanel from './eventViewPage/TabPanel'
import Title from './eventViewPage/Title'
import {
  adminBackgroundActionsRunningAtom,
  adminConfirmedEventAtom,
  adminEventClassAtom,
  adminEventIdAtom,
  adminProjectedEventRegistrationsAtom,
  adminRegistrationIdAtom,
  useAdminEventActions,
} from './state'
import { useAdminRegistrationActions } from './state/registrations/actions'

/** Tab id of the whole-trial list a shared reserve list gets; no class can carry this name. */
const ALL_CLASSES_TAB = '*'

export default function EventViewPage() {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [msgDlgOpen, setMsgDlgOpen] = useState(false)
  const [recipientsOpen, setRecipientsOpen] = useState(false)
  const [refundOpen, setRefundOpen] = useState(false)
  const [cancelOpen, setCancelOpen] = useState(false)

  const params = useParams()
  const eventId = params.id ?? ''
  const { viewers } = useEventSubscription(eventId)
  const [, setSelectedEventId] = useAtom(adminEventIdAtom)
  const event = useAtomValue(adminConfirmedEventAtom(eventId))
  const actions = useAdminRegistrationActions(eventId)
  const eventActions = useAdminEventActions()

  const [selectedEventClass, setSelectedEventClass] = useAtom(adminEventClassAtom)
  const [selectedRegistrationId, setSelectedRegistrationId] = useAtom(adminRegistrationIdAtom)
  const allRegistrations = useAtomValue(adminProjectedEventRegistrationsAtom(eventId))
  const selectedRegistration = useMemo(
    () => selectedRegistrationId && allRegistrations.find((r) => r.id === selectedRegistrationId),
    [allRegistrations, selectedRegistrationId]
  )
  const [recipientRegistrations, setRecipientRegistrations] = useState<Registration[]>([])
  const [messageTemplateId, setMessageTemplateId] = useState<EmailTemplateId>()
  const { eventClasses, stateByClass, missingClasses } = useAdminEventRegistrationInfo(event, allRegistrations)
  const allClasses = useMemo(() => eventClasses.concat(missingClasses), [eventClasses, missingClasses])
  const currentEventClass = useMemo(
    () => (selectedEventClass && allClasses.includes(selectedEventClass) ? selectedEventClass : allClasses[0]),
    [allClasses, selectedEventClass]
  )
  const backgroundActionsRunning = useAtomValue(adminBackgroundActionsRunningAtom)

  // A WT trial's reserve list is the whole trial's, so it gets a tab of its own that spans every
  // class: one list to pick from, and a dropped dog lands in the class it entered (KOE-912).
  const [allClassesTabSelected, setAllClassesTabSelected] = useState(false)
  const tabs = useMemo(
    () => (hasSharedReserveList(event?.eventType) ? [...allClasses, ALL_CLASSES_TAB] : allClasses),
    [allClasses, event?.eventType]
  )
  const allClassesTabIndex = tabs.indexOf(ALL_CLASSES_TAB)
  const activeTab = useMemo(
    () =>
      allClassesTabSelected && allClassesTabIndex >= 0
        ? allClassesTabIndex
        : Math.max(tabs.indexOf(currentEventClass), 0),
    [allClassesTabIndex, allClassesTabSelected, currentEventClass, tabs]
  )

  const handleTabChange = useCallback(
    (_: React.SyntheticEvent, newValue: number) => {
      const next = tabs[newValue]
      setAllClassesTabSelected(next === ALL_CLASSES_TAB)
      if (next && isRegistrationClass(next)) {
        setSelectedEventClass(next)
      }
    },
    [setSelectedEventClass, tabs]
  )

  const handleClose = useCallback(() => setOpen(false), [])
  const handleCancelClose = useCallback(() => setCancelOpen(false), [])
  const handleCreateClose = useCallback(() => setCreateOpen(false), [])
  const handleDetailsClose = useCallback(() => setDetailsOpen(false), [])
  const handleRefundClose = useCallback(() => setRefundOpen(false), [])
  const closeMsgDlg = useCallback(() => setMsgDlgOpen(false), [])
  const closeRecipients = useCallback(() => setRecipientsOpen(false), [])

  const handleOpenMsgDialog = (recipients: Registration[], templateId?: EmailTemplateId) => {
    setRecipientRegistrations(recipients)
    setMessageTemplateId(templateId)
    setMsgDlgOpen(true)
  }

  // The secretary picks the recipient groups first, and writes the message to them after (KOE-1073).
  const handleRecipientsContinue = (recipients: Registration[]) => {
    setRecipientsOpen(false)
    handleOpenMsgDialog(recipients, 'message')
  }

  const handleCancel = useCallback(
    async (reason: string) => {
      if (!selectedRegistration) return
      setCancelOpen(false)
      await actions.cancel(selectedRegistration.eventId, selectedRegistration.id, reason)
    },
    [actions, selectedRegistration]
  )

  useEffect(() => {
    if (eventId) {
      setSelectedEventId(eventId)
    }
  }, [eventId, setSelectedEventId])

  useEffect(() => {
    const refresh = () => void actions.refreshIfStale().catch(reportError)

    refresh()

    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') {
        refresh()
      }
    }
    document.addEventListener('visibilitychange', refreshWhenVisible)

    return () => document.removeEventListener('visibilitychange', refreshWhenVisible)
  }, [actions.refreshIfStale])

  useEffect(() => {
    if (!allClasses.length) {
      return
    }

    if (currentEventClass && currentEventClass !== selectedEventClass && isRegistrationClass(currentEventClass)) {
      setSelectedEventClass(currentEventClass)
      setSelectedRegistrationId(undefined)
    } else if (!selectedEventClass || !allClasses.includes(selectedEventClass)) {
      const fallback = allClasses[0]
      if (fallback && isRegistrationClass(fallback)) {
        setSelectedEventClass(fallback)
      }
    }
  }, [allClasses, currentEventClass, selectedEventClass, setSelectedEventClass, setSelectedRegistrationId])

  if (!event?.id) {
    return <EventNotFound />
  }

  return (
    // The entry lists are laid out for a desk, and go wide before they go narrow (KOE-735).
    <Box sx={{ display: 'flex', flexDirection: 'column', flexGrow: 1, minWidth: 900 }}>
      <OtherViewers viewers={viewers} />

      <Title event={event} />
      <InfoPanel
        event={event}
        onCreateRegistration={() => setCreateOpen(true)}
        onOpenDetails={() => setDetailsOpen(true)}
        onSetResultsPublished={(eventClass, published) =>
          eventActions.setResultsClassPublished(event, eventClass, published)
        }
        onSetStartNumbersPublished={(eventClass, published, date) =>
          eventClass
            ? eventActions.setStartNumbersClassPublished(event, eventClass, published, date)
            : eventActions.setStartNumbersPublished(event, published, date)
        }
        onSetStartListPublished={(eventClass, published) =>
          eventClass
            ? eventActions.setStartListClassPublished(event, eventClass, published)
            : eventActions.setStartListPublished(event, published)
        }
        registrations={allRegistrations}
        onOpenMessageDialog={handleOpenMsgDialog}
        onSendMessage={() => setRecipientsOpen(true)}
      />

      <Stack
        direction="row"
        sx={{
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <Tabs value={activeTab} onChange={handleTabChange}>
          {tabs.map((eventClass) => (
            <Tab
              key={`tab-${eventClass}`}
              id={`tab-${eventClass}`}
              sx={{
                bgcolor: missingClasses.includes(eventClass) ? '#fdeded' : undefined,
                borderLeft: '1px solid',
                borderLeftColor: 'divider',
              }}
              label={eventClass === ALL_CLASSES_TAB ? t('eventManagement.allClasses') : eventClass}
            ></Tab>
          ))}
        </Tabs>
        <CircularProgress
          size={20}
          color="info"
          sx={{ opacity: backgroundActionsRunning ? 1 : 0, transition: 'opacity 0.1s ease-in-out' }}
        />
      </Stack>

      {tabs.map((eventClass, index) => {
        const allClassesTab = eventClass === ALL_CLASSES_TAB

        return (
          <TabPanel key={`tabPanel-${eventClass}`} index={index} activeTab={activeTab}>
            {missingClasses.includes(eventClass) ? (
              <Alert severity="info" sx={{ m: 1 }}>
                Nämä ilmoittautumiset ovat koeluokassa, jota ei enää ole kokeessa. Ilmoittautumisten luokat täytyy
                korjata.
              </Alert>
            ) : null}
            <ClassEntrySelection
              event={event}
              eventClass={allClassesTab ? undefined : eventClass}
              registrations={
                allClassesTab
                  ? allRegistrations
                  : allRegistrations.filter((registration) => getRegistrationClass(registration) === eventClass)
              }
              setOpen={setOpen}
              setCancelOpen={setCancelOpen}
              setRefundOpen={setRefundOpen}
              selectedRegistrationId={selectedRegistrationId}
              setSelectedRegistrationId={setSelectedRegistrationId}
              state={allClassesTab ? event.state : stateByClass[eventClass]}
            />
          </TabPanel>
        )
      })}
      <Suspense
        fallback={
          <Modal open>
            <Box tabIndex={-1}>
              <LoadingIndicator />
            </Box>
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
        <MessageRecipientsDialog
          event={event}
          onCancel={closeRecipients}
          onContinue={handleRecipientsContinue}
          open={recipientsOpen}
          registrations={allRegistrations}
        />
        <EventDetailsDialog eventId={eventId} open={detailsOpen} onClose={handleDetailsClose} />
        {selectedRegistration && (
          <RefundDailog registration={selectedRegistration} open={refundOpen} onClose={handleRefundClose} />
        )}
        {selectedRegistration && (
          <CancelDialog
            admin
            event={event}
            open={cancelOpen}
            onClose={handleCancelClose}
            onCancel={handleCancel}
            registration={selectedRegistration}
          />
        )}
      </Suspense>
    </Box>
  )
}
