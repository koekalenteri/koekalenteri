import { Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useParams } from 'react-router-dom'
import {
  AddCircleOutline,
  DeleteOutline,
  EditOutlined,
  EmailOutlined,
  FormatListBulleted,
  ShuffleOutlined,
  TableChartOutlined,
} from '@mui/icons-material'
import { Box, Button, Divider, Grid, Stack, Tab, Tabs } from '@mui/material'
import { useRecoilState, useRecoilValue } from 'recoil'

import { Path } from '../../routeConfig'
import { uniqueClassDates, uniqueClasses } from '../../utils'
import LinkButton from '../components/LinkButton'

import FullPageFlex from './components/FullPageFlex'
import ClassEntrySelection from './eventViewPage/ClassEntrySelection'
import InfoPanel from './eventViewPage/InfoPanel'
import RegistraionEditDialog from './eventViewPage/RegistrationEditDialog'
import SendMessageDialog from './eventViewPage/SendMessageDialog'
import TabPanel from './eventViewPage/TabPanel'
import Title from './eventViewPage/Title'
import {
  adminRegistrationIdAtom,
  currentEventClassRegistrationsSelector,
  editableEventByIdAtom,
  eventClassAtom,
} from './recoil'

export default function EventViewPage() {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [msgDlgOpen, setMsgDlgOpen] = useState(false)

  const params = useParams()
  const event = useRecoilValue(editableEventByIdAtom(params.id ?? ''))
  const eventClasses = useMemo(() => {
    const classes = uniqueClasses(event)
    if (event && !classes.length) {
      return [event.eventType]
    }
    return classes
  }, [event])
  const [selectedEventClass, setSelectedEventClass] = useRecoilState(eventClassAtom)
  const activeTab = useMemo(
    () => Math.max(eventClasses.findIndex((c) => c === selectedEventClass) ?? 0, 0),
    [eventClasses, selectedEventClass]
  )
  const [selectedRegistrationId, setSelectedRegistrationId] = useRecoilState(adminRegistrationIdAtom)
  const registrations = useRecoilValue(currentEventClassRegistrationsSelector)

  const handleTabChange = useCallback(
    (_: React.SyntheticEvent, newValue: number) => {
      setSelectedEventClass(eventClasses[newValue])
    },
    [eventClasses, setSelectedEventClass]
  )

  const handleClose = useCallback(() => {
    setOpen(false)
  }, [])

  function openMsgDlg() {
    setMsgDlgOpen(true)
  }
  function closeMsgDlg() {
    setMsgDlgOpen(false)
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
            <InfoPanel event={event} registrations={registrations} />
          </Grid>
        </Grid>

        <Stack direction="row" spacing={2}>
          <Button startIcon={<FormatListBulleted />} disabled>
            Näytä tiedot
          </Button>
          <Button startIcon={<TableChartOutlined />} disabled>
            Vie Exceliin
          </Button>
          <Button startIcon={<EmailOutlined />} onClick={openMsgDlg}>
            Lähetä viesti
          </Button>
          <Button startIcon={<ShuffleOutlined />} disabled>
            Arvo kokeen osallistujat
          </Button>
          <Divider orientation="vertical"></Divider>
          <Button
            startIcon={<AddCircleOutline />}
            onClick={() => {
              setOpen(true)
            }}
          >
            {t('create')}
          </Button>
          <Button
            startIcon={<EditOutlined />}
            disabled={!selectedRegistrationId}
            onClick={() => {
              setOpen(true)
            }}
          >
            {t('edit')}
          </Button>
          <Button startIcon={<DeleteOutline />} disabled>
            {t('delete')}
          </Button>
        </Stack>

        <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
          <Tabs value={activeTab} onChange={handleTabChange}>
            {eventClasses.map((eventClass) => (
              <Tab key={`tab-${eventClass}`} id={`tab-${eventClass}`} label={eventClass}></Tab>
            ))}
          </Tabs>
        </Box>

        {eventClasses.map((eventClass, index) => (
          <TabPanel key={`tabPanel-${eventClass}`} index={index} activeTab={activeTab}>
            <ClassEntrySelection
              eventDates={uniqueClassDates(event, eventClass)}
              registrations={registrations}
              setOpen={setOpen}
              selectedRegistrationId={selectedRegistrationId}
              setSelectedRegistrationId={setSelectedRegistrationId}
            />
          </TabPanel>
        ))}

        <Suspense>
          <RegistraionEditDialog
            registrationId={open ? selectedRegistrationId ?? '' : ''}
            open={open}
            onClose={handleClose}
          />
        </Suspense>
        <Suspense>
          <SendMessageDialog registrations={registrations} open={msgDlgOpen} onClose={closeMsgDlg} event={event} />
        </Suspense>
      </FullPageFlex>
    </>
  )
}
