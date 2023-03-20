import { Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useParams } from 'react-router-dom'
import { AddCircleOutline, EditOutlined, EmailOutlined, FormatListBulleted } from '@mui/icons-material'
import { Box, Button, Divider, Grid, Stack, Tab, Tabs } from '@mui/material'
import { EmailTemplateId, Registration } from 'koekalenteri-shared/model'
import { useRecoilState, useRecoilValue } from 'recoil'

import useEventRegistrationInfo from '../../hooks/useEventRegistrationsInfo'
import { Path } from '../../routeConfig'
import { uniqueClassDates } from '../../utils'
import LinkButton from '../components/LinkButton'

import FullPageFlex from './components/FullPageFlex'
import ClassEntrySelection from './eventViewPage/ClassEntrySelection'
import InfoPanel from './eventViewPage/InfoPanel'
import RegistrationCreateDialog from './eventViewPage/RegistrationCreateDialog'
import RegistrationEditDialog from './eventViewPage/RegistrationEditDialog'
import SendMessageDialog from './eventViewPage/SendMessageDialog'
import TabPanel from './eventViewPage/TabPanel'
import Title from './eventViewPage/Title'
import { adminRegistrationIdAtom, editableEventByIdAtom, eventClassAtom, eventRegistrationsAtom } from './recoil'

export default function EventViewPage() {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [msgDlgOpen, setMsgDlgOpen] = useState(false)

  const params = useParams()
  const eventId = params.id ?? ''
  const event = useRecoilValue(editableEventByIdAtom(eventId))

  const [selectedEventClass, setSelectedEventClass] = useRecoilState(eventClassAtom)
  const [selectedRegistrationId, setSelectedRegistrationId] = useRecoilState(adminRegistrationIdAtom)
  const allRegistrations = useRecoilValue(eventRegistrationsAtom(eventId))
  const registrations = useMemo(
    () => allRegistrations.filter((r) => r.class === selectedEventClass || r.eventType === selectedEventClass),
    [allRegistrations, selectedEventClass]
  )
  const [recipientRegistrations, setRecipientRegistrations] = useState<Registration[]>([])
  const [messageTemplateId, setMessageTemplateId] = useState<EmailTemplateId>()
  const { eventClasses } = useEventRegistrationInfo(event, allRegistrations)

  const activeTab = useMemo(
    () => Math.max(eventClasses.findIndex((c) => c === selectedEventClass) ?? 0, 0),
    [eventClasses, selectedEventClass]
  )

  const handleTabChange = useCallback(
    (_: React.SyntheticEvent, newValue: number) => {
      setSelectedEventClass(eventClasses[newValue])
    },
    [eventClasses, setSelectedEventClass]
  )

  const handleClose = useCallback(() => setOpen(false), [])
  const handleCreateClose = useCallback(() => setCreateOpen(false), [])

  function openMsgDlg() {
    setMsgDlgOpen(true)
  }
  function closeMsgDlg() {
    setMsgDlgOpen(false)
  }

  const handleOpenMsgDialog = (recipients: Registration[], templateId?: EmailTemplateId) => {
    setRecipientRegistrations(recipients)
    setMessageTemplateId(templateId)
    setMsgDlgOpen(true)
  }

  useEffect(() => {
    if (selectedEventClass && !eventClasses.includes(selectedEventClass)) {
      setSelectedEventClass(eventClasses[0])
    }
  }, [eventClasses, selectedEventClass, setSelectedEventClass])

  if (!event) {
    return <>duh</>
  }

  return (
    <>
      <FullPageFlex>
        <Grid container justifyContent="space-between">
          <Grid item xs>
            <LinkButton sx={{ mb: 1 }} to={Path.admin.events} text={t('goBack')} />
            <Title event={event} />
          </Grid>
          <Grid item xs="auto">
            <InfoPanel event={event} registrations={allRegistrations} onOpenMessageDialog={handleOpenMsgDialog} />
          </Grid>
        </Grid>

        <Stack direction="row" spacing={2}>
          <Button startIcon={<FormatListBulleted />} disabled>
            Näytä kokeen tiedot
          </Button>
          <Button startIcon={<EmailOutlined />} onClick={openMsgDlg}>
            Lähetä viesti
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

        <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
          <Tabs value={activeTab} onChange={handleTabChange}>
            {eventClasses.map((eventClass) => (
              <Tab
                key={`tab-${eventClass}`}
                id={`tab-${eventClass}`}
                sx={{ borderLeft: '1px solid', borderLeftColor: 'divider' }}
                label={eventClass}
              ></Tab>
            ))}
          </Tabs>
        </Box>

        {eventClasses.map((eventClass, index) => (
          <TabPanel key={`tabPanel-${eventClass}`} index={index} activeTab={activeTab}>
            <ClassEntrySelection
              eventClass={eventClass}
              eventDates={uniqueClassDates(event, eventClass)}
              registrations={registrations}
              setOpen={setOpen}
              selectedRegistrationId={selectedRegistrationId}
              setSelectedRegistrationId={setSelectedRegistrationId}
            />
          </TabPanel>
        ))}

        <Suspense>
          <RegistrationEditDialog
            event={event}
            onClose={handleClose}
            open={open}
            registrationId={open ? selectedRegistrationId ?? '' : ''}
          />
        </Suspense>
        <Suspense>
          <RegistrationCreateDialog
            event={event}
            eventClass={selectedEventClass !== event.eventType ? selectedEventClass : undefined}
            onClose={handleCreateClose}
            open={createOpen}
            registrationId={open ? selectedRegistrationId ?? '' : ''}
          />
        </Suspense>
        <Suspense>
          <SendMessageDialog
            event={event}
            onClose={closeMsgDlg}
            open={msgDlgOpen}
            registrations={recipientRegistrations}
            templateId={messageTemplateId}
          />
        </Suspense>
      </FullPageFlex>
    </>
  )
}
