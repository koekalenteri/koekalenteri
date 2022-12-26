import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AddCircleOutline, DeleteOutline, EditOutlined, EmailOutlined, FormatListBulleted, ShuffleOutlined, TableChartOutlined } from '@mui/icons-material'
import { Box, Button, CircularProgress, Dialog, DialogContent, DialogTitle, Divider, Grid, Stack, Tab, Tabs } from '@mui/material'
import { ConfirmedEventEx, Registration } from 'koekalenteri-shared/model'
import { toJS } from 'mobx'
import { observer } from 'mobx-react-lite'

import { putRegistration } from '../../api/event'
import { CollapsibleSection, LinkButton, RegistrationForm } from '../../components'
import { Path } from '../../routeConfig'
import { useStores } from '../../stores'
import { unique } from '../../utils'

import FullPageFlex from './components/FullPageFlex'
import ClassEntrySelection from './eventViewPage/ClassEntrySelection'
import InfoPanel from './eventViewPage/InfoPanel'
import TabPanel from './eventViewPage/TabPanel'
import Title from './eventViewPage/Title'

export const EventViewPageWithData = observer(function EventViewPageWithData() {
  const { privateStore } = useStores()

  if (!privateStore.selectedEvent) {
    return null
  }

  return (
    <EventViewPage
      event={toJS(privateStore.selectedEvent) as ConfirmedEventEx}
      registrations={toJS(privateStore.selectedEventRegistrations)}
      loading={toJS(privateStore.loading)}
    />
  )
})

interface Props {
  event: ConfirmedEventEx
  registrations: Registration[]
  loading: boolean
}

export const EventViewPage = ({event, registrations, loading}: Props) => {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [list, setList] = useState(registrations)
  const [selected, setSelected] = useState<Registration>()
  const [activeTab, setActiveTab] = useState<number>(0)

  const handleTabChange = (event: React.SyntheticEvent, newValue: number) => {
    setActiveTab(newValue)
  }

  const uniqueClasses = unique(event.classes.map(c => c.class))

  const onSave = async (registration: Registration) => {
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
  }
  const onCancel = async () => {
    setOpen(false)
    return true
  }

  if (loading) {
    return <CircularProgress />
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
            {uniqueClasses.map(eventClass => <Tab key={`tab-${eventClass}`} id={`tab-${eventClass}`} label={eventClass}></Tab>)}
          </Tabs>
        </Box>

        {uniqueClasses.map((eventClass, index) =>
          <TabPanel key={`tabPanel-${eventClass}`} index={index} activeTab={activeTab}>
            <ClassEntrySelection
              event={event}
              eventClass={eventClass}
              registrations={list.filter(r => r.class === eventClass)}
              setOpen={setOpen}
            />
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
          <RegistrationForm event={event} registration={selected} onSave={onSave} onCancel={onCancel} />
        </DialogContent>
      </Dialog>
    </>
  )

}
