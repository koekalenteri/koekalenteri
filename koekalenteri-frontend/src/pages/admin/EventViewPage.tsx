import { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useParams } from 'react-router-dom'
import { AddCircleOutline, DeleteOutline, EditOutlined, EmailOutlined, FormatListBulleted, ShuffleOutlined, TableChartOutlined } from '@mui/icons-material'
import { Box, Button, Dialog, DialogContent, DialogTitle, Divider, Grid, Stack, Tab, Tabs } from '@mui/material'
import { ConfirmedEvent, Registration } from 'koekalenteri-shared/model'
import { useRecoilState, useRecoilValue } from 'recoil'

import { Path } from '../../routeConfig'
import { uniqueClassDates, uniqueClasses } from '../../utils'
import CollapsibleSection from '../components/CollapsibleSection'
import LinkButton from '../components/LinkButton'
import RegistrationForm from '../components/RegistrationForm'

import FullPageFlex from './components/FullPageFlex'
import ClassEntrySelection from './eventViewPage/ClassEntrySelection'
import InfoPanel from './eventViewPage/InfoPanel'
import TabPanel from './eventViewPage/TabPanel'
import Title from './eventViewPage/Title'
import { useAdminRegistrationActions } from './recoil/registrations/actions'
import { currentAdminRegistrationSelector, editableEventSelector, eventClassAtom } from './recoil'

export default function EventViewPage() {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const params = useParams()
  const event = useRecoilValue(editableEventSelector(params.id))
  const eventClasses = useMemo(() => uniqueClasses(event), [event])
  const [selectedEventClass, setSelectedEventClass] = useRecoilState(eventClassAtom)
  const activeTab = useMemo(() => Math.max(eventClasses.findIndex(c => c === selectedEventClass) ?? 0, 0), [eventClasses, selectedEventClass])
  const selectedRegistration = useRecoilValue(currentAdminRegistrationSelector)
  const actions = useAdminRegistrationActions()

  const handleTabChange = useCallback((_: React.SyntheticEvent, newValue: number) => {
    setSelectedEventClass(eventClasses[newValue])
  }, [eventClasses, setSelectedEventClass])

  const onSave = useCallback(async (registration: Registration) => {
    if (await actions.save(registration)) {
      setOpen(false)
      return true
    }
    return false
  }, [actions])

  const onCancel = useCallback(async () => {
    setOpen(false)
    return true
  }, [])

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
          <Button startIcon={<AddCircleOutline />} onClick={() => { setOpen(true) }}>{t('create')}</Button>
          <Button startIcon={<EditOutlined />} disabled={!selectedRegistration} onClick={() => setOpen(true)}>{t('edit')}</Button>
          <Button startIcon={<DeleteOutline />} disabled>{t('delete')}</Button>
        </Stack>

        <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
          <Tabs value={activeTab} onChange={handleTabChange}>
            {eventClasses.map(eventClass => <Tab key={`tab-${eventClass}`} id={`tab-${eventClass}`} label={eventClass}></Tab>)}
          </Tabs>
        </Box>

        {uniqueClasses(event).map((eventClass, index) =>
          <TabPanel key={`tabPanel-${eventClass}`} index={index} activeTab={activeTab}>
            <ClassEntrySelection eventDates={uniqueClassDates(event, eventClass)} setOpen={setOpen} />
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
        <DialogTitle id="reg-dialog-title">{selectedRegistration ? `${selectedRegistration.dog.name} / ${selectedRegistration.handler.name}` : t('create')}</DialogTitle>
        <DialogContent dividers sx={{height: '100%', p: 0 }}>
          <RegistrationForm event={event as ConfirmedEvent} registration={selectedRegistration} onSave={onSave} onCancel={onCancel} />
        </DialogContent>
      </Dialog>
    </>
  )

}
