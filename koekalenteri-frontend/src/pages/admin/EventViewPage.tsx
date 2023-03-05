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
import { Box, Button, Divider, Grid, Stack, Tab, Tabs, Typography } from '@mui/material'
import { EmailTemplateId, Registration } from 'koekalenteri-shared/model'
import { useRecoilState, useRecoilValue } from 'recoil'

import useEventRegistrationInfo from '../../hooks/useEventRegistrationsInfo'
import { Path } from '../../routeConfig'
import { uniqueClassDates } from '../../utils'
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
  currentEventRegistrationsSelector,
  editableEventByIdAtom,
  eventClassAtom,
} from './recoil'

export default function EventViewPage() {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [msgDlgOpen, setMsgDlgOpen] = useState(false)

  const params = useParams()
  const event = useRecoilValue(editableEventByIdAtom(params.id ?? ''))

  const [selectedEventClass, setSelectedEventClass] = useRecoilState(eventClassAtom)
  const [selectedRegistrationId, setSelectedRegistrationId] = useRecoilState(adminRegistrationIdAtom)
  const allRegistrations = useRecoilValue(currentEventRegistrationsSelector)
  const registrations = useRecoilValue(currentEventClassRegistrationsSelector)
  const [recipientRegistrations, setRecipientRegistrations] = useState<Registration[]>([])
  const [messageTemplateId, setMessageTemplateId] = useState<EmailTemplateId>()
  const { eventClasses, numbersByClass } = useEventRegistrationInfo(event, allRegistrations)

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

  const handleClose = useCallback(() => {
    setOpen(false)
  }, [])

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

  const progressColor = (value: number) => {
    if (value === 100) return 'green'
    if (value > 100) return 'red'
    return 'blue'
  }

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
              <Tab
                key={`tab-${eventClass}`}
                id={`tab-${eventClass}`}
                sx={{ borderLeft: '1px solid', borderLeftColor: 'divider' }}
                label={
                  <Box sx={{ display: 'flex', alignItems: 'center' }}>
                    <Box sx={{ width: '100%', mr: 1 }}>{eventClass}</Box>
                    <Box
                      sx={{
                        minWidth: 50,
                        textAlign: 'end',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'flex-end',
                        columnGap: 1,
                      }}
                    >
                      <Typography
                        variant="caption"
                        sx={{ color: progressColor(numbersByClass[eventClass]?.value || 0) }}
                      >
                        {numbersByClass[eventClass]?.participants ?? 0} / {numbersByClass[eventClass]?.places}
                      </Typography>
                    </Box>
                  </Box>
                }
              ></Tab>
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
          <SendMessageDialog
            registrations={recipientRegistrations}
            templateId={messageTemplateId}
            open={msgDlgOpen}
            onClose={closeMsgDlg}
            event={event}
          />
        </Suspense>
      </FullPageFlex>
    </>
  )
}
