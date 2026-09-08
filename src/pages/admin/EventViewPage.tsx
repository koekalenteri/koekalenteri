import type { Registration } from '../../types'
import type { EventViewDialog } from './state/eventViewDialog'
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
import { hasEntryEnded, hasSharedReserveList, isEntryEditingClosed } from '../../lib/event'
import { getRegistrationClass, isRegistrationClass } from '../../lib/registration'
import CancelDialog from '../components/CancelDialog'
import LoadingIndicator from '../components/LoadingIndicator'
import { useHelpPath } from '../state/docs'
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
  adminEventViewDialogAtom,
  adminProjectedEventRegistrationsAtom,
  adminRegistrationIdAtom,
  useAdminEventActions,
} from './state'
import { useAdminEventScope } from './state/eventScope'
import { useAdminRegistrationActions } from './state/registrations/actions'

/** Tab id of the whole-trial list a shared reserve list gets; no class can carry this name. */
const ALL_CLASSES_TAB = '*'

export default function EventViewPage() {
  const { t } = useTranslation()
  // The open dialog is one value the whole page shares: the actions that open one sit in the entry
  // lists and the info panel, and set it from there (KOE-1347).
  const [dialog, setDialog] = useAtom(adminEventViewDialogAtom)
  const closeDialog = useCallback(() => setDialog(undefined), [setDialog])
  // The message dialog keeps its recipients through its closing fade.
  const [message, setMessage] = useState<Extract<EventViewDialog, { kind: 'message' }>>()
  useEffect(() => {
    if (dialog?.kind === 'message') setMessage(dialog)
  }, [dialog])
  // Leaving the page closes whatever was open; the next event must not start with a dialog up.
  useEffect(() => closeDialog, [closeDialog])

  const params = useParams()
  const eventId = params.id ?? ''
  useAdminEventScope(eventId)
  const { viewers } = useEventSubscription(eventId)
  const [, setSelectedEventId] = useAtom(adminEventIdAtom)
  const event = useAtomValue(adminConfirmedEventAtom(eventId))
  // The secretary's guide is one page while entry is open and another once it has ended (KOE-1402).
  useHelpPath(event && hasEntryEnded(event) ? 'koesihteerille/ilmoajan-jalkeen' : 'koesihteerille/ilmoaikana')
  const actions = useAdminRegistrationActions(eventId)
  const eventActions = useAdminEventActions()

  const [selectedEventClass, setSelectedEventClass] = useAtom(adminEventClassAtom)
  const [selectedRegistrationId, setSelectedRegistrationId] = useAtom(adminRegistrationIdAtom)
  const allRegistrations = useAtomValue(adminProjectedEventRegistrationsAtom(eventId))
  const selectedRegistration = useMemo(
    () => selectedRegistrationId && allRegistrations.find((r) => r.id === selectedRegistrationId),
    [allRegistrations, selectedRegistrationId]
  )
  const { eventClasses, stateByClass, missingClasses } = useAdminEventRegistrationInfo(event, allRegistrations)
  // The entry stays readable after its class has been judged, but not editable; the class the entry
  // sits in decides, the same way the list's own actions are gated (KOE-1388).
  const entryEditingClosed = useMemo(() => {
    if (!event) return false
    const registrationClass = selectedRegistration ? getRegistrationClass(selectedRegistration) : undefined
    return isEntryEditingClosed(event, registrationClass ? stateByClass[registrationClass] : event.state)
  }, [event, selectedRegistration, stateByClass])
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

  // The secretary picks the recipient groups first, and writes the message to them after (KOE-1073).
  const handleRecipientsContinue = useCallback(
    (recipients: Registration[]) => setDialog({ kind: 'message', recipients, templateId: 'message' }),
    [setDialog]
  )

  const handleCancel = useCallback(
    async (reason: string) => {
      if (!selectedRegistration) return
      closeDialog()
      await actions.cancel(selectedRegistration.eventId, selectedRegistration.id, reason)
    },
    [actions, closeDialog, selectedRegistration]
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
          aria-label={t('loading')}
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
                {t('eventManagement.missingClass')}
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
          disabled={entryEditingClosed}
          event={event}
          onClose={closeDialog}
          open={dialog?.kind === 'edit'}
          registrationId={dialog?.kind === 'edit' ? (selectedRegistrationId ?? '') : ''}
        />
        <RegistrationCreateDialog
          event={event}
          eventClass={
            isRegistrationClass(selectedEventClass) && eventClasses.includes(selectedEventClass)
              ? selectedEventClass
              : undefined
          }
          onClose={closeDialog}
          open={dialog?.kind === 'create'}
        />
        <SendMessageDialog
          event={event}
          onClose={closeDialog}
          open={dialog?.kind === 'message'}
          registrations={message?.recipients ?? []}
          templateId={message?.templateId}
        />
        <MessageRecipientsDialog
          event={event}
          onCancel={closeDialog}
          onContinue={handleRecipientsContinue}
          open={dialog?.kind === 'recipients'}
          registrations={allRegistrations}
        />
        <EventDetailsDialog eventId={eventId} open={dialog?.kind === 'details'} onClose={closeDialog} />
        {selectedRegistration && (
          <RefundDailog
            event={event}
            registration={selectedRegistration}
            open={dialog?.kind === 'refund'}
            onClose={closeDialog}
          />
        )}
        {selectedRegistration && (
          <CancelDialog
            admin
            event={event}
            open={dialog?.kind === 'cancel'}
            onClose={closeDialog}
            onCancel={handleCancel}
            registration={selectedRegistration}
          />
        )}
      </Suspense>
    </Box>
  )
}
