import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useParams } from 'react-router-dom'
import { AddCircleOutline, DeleteOutline, EditOutlined, EmailOutlined, FormatListBulleted, ShuffleOutlined, TableChartOutlined } from '@mui/icons-material'
import { Box, Button, Dialog, DialogContent, DialogTitle, Divider, Grid, Stack, Tab, Tabs } from '@mui/material'
import { ConfirmedEventEx, Registration } from 'koekalenteri-shared/model'
import { useRecoilState, useRecoilValue } from 'recoil'

import { CollapsibleSection, LinkButton, RegistrationForm } from '../../components'
import { Path } from '../../routeConfig'

import FullPageFlex from './components/FullPageFlex'
import ClassEntrySelection from './eventViewPage/ClassEntrySelection'
import InfoPanel from './eventViewPage/InfoPanel'
import TabPanel from './eventViewPage/TabPanel'
import Title from './eventViewPage/Title'
import { adminEventIdAtom, currentAdminEvent, eventClassAtom } from './recoil'

const EventViewPage = () => {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const params = useParams()
  const [selectedEventID, setSelectedEventID] = useRecoilState(adminEventIdAtom)
  const event = useRecoilValue(currentAdminEvent)
  const [selectedEventClass, setSelectedEventClass] = useRecoilState(eventClassAtom)
  const activeTab = useMemo(() => event?.uniqueClasses?.findIndex(c => c === selectedEventClass) ?? 0, [event?.uniqueClasses, selectedEventClass])
  const [selected, setSelected] = useState<Registration>()

  useEffect(() => {
    if (params.id && params.id !== selectedEventID) {
      setSelectedEventID(params.id)
    }
  }, [params.id, selectedEventID, setSelectedEventID])

  const handleTabChange = (_: React.SyntheticEvent, newValue: number) => {
    setSelectedEventClass(event?.uniqueClasses?.[newValue])
  }

  const onSave = async (registration: Registration) => {
    /*
    try {
      const saved = await putRegistration(registration)
      const old = list.find(r => r.id === saved.id)
      if (old) {
        Object.assign(old, saved)
        setSelected(saved)
      } else {
        setList(list.concat([saved]))
        event.entries++
      }
      setOpen(false)
      return true
    } catch (e: any) {
      console.error(e)
      return false
    }
    */
    return false
  }
  const onCancel = async () => {
    setOpen(false)
    return true
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
            <CollapsibleSection title="Kokeen tiedot" initOpen={false}>
                Kokeen tarkat tiedot tähän...
            </CollapsibleSection>
              Filttereitä tähän...
          </Grid>
          <Grid item xs="auto">
            <InfoPanel event={event} />
          </Grid>
        </Grid>

        <Stack direction="row" spacing={2}>
          <Button startIcon={<FormatListBulleted />} disabled>Näytä tiedot</Button>
          <Button startIcon={<TableChartOutlined />} disabled>Vie Exceliin</Button>
          <Button startIcon={<EmailOutlined />} disabled>Lähetä viesti</Button>
          <Button startIcon={<ShuffleOutlined />} disabled>Arvo kokeen osallistujat</Button>
          <Divider orientation='vertical'></Divider>
          <Button startIcon={<AddCircleOutline />} onClick={() => { setSelected(undefined); setOpen(true) }}>{t('create')}</Button>
          <Button startIcon={<EditOutlined />} disabled={!selected} onClick={() => setOpen(true)}>{t('edit')}</Button>
          <Button startIcon={<DeleteOutline />} disabled>{t('delete')}</Button>
        </Stack>

        <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
          <Tabs value={activeTab} onChange={handleTabChange}>
            {event.uniqueClasses?.map(eventClass => <Tab key={`tab-${eventClass}`} id={`tab-${eventClass}`} label={eventClass}></Tab>)}
          </Tabs>
        </Box>

        {event.uniqueClasses?.map((eventClass, index) =>
          <TabPanel key={`tabPanel-${eventClass}`} index={index} activeTab={activeTab}>
            <ClassEntrySelection eventDates={event.uniqueClassDates(eventClass)} setOpen={setOpen} />
          </TabPanel>,
        )}

      </FullPageFlex>
      <Dialog
        fullWidth
        maxWidth='lg'
        open={open}
        onClose={() => setOpen(false)}
        aria-labelledby="reg-dialog-title"
        PaperProps={{
          sx: {
            m: 1,
            maxHeight: 'calc(100% - 16px)',
            width: 'calc(100% - 16px)',
            '& .MuiDialogTitle-root': {
              fontSize: '1rem',
            },
          },
        }}
      >
        <DialogTitle id="reg-dialog-title">{selected ? `${selected.dog.name} / ${selected.handler.name}` : t('create')}</DialogTitle>
        <DialogContent dividers sx={{height: '100%', p: 0 }}>
          <RegistrationForm event={event as ConfirmedEventEx} registration={selected} onSave={onSave} onCancel={onCancel} />
        </DialogContent>
      </Dialog>
    </>
  )

}

export default EventViewPage
