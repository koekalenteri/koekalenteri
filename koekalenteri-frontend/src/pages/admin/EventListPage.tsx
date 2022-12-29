import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { AddCircleOutline, ContentCopyOutlined, DeleteOutline, EditOutlined, FormatListNumberedOutlined } from '@mui/icons-material'
import { Button, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle, FormControlLabel, Stack, Switch, TextField } from '@mui/material'
import { useRecoilValue } from 'recoil'

import { AutoButton } from '../../components'
import { Path } from '../../routeConfig'

import FullPageFlex from './components/FullPageFlex'
import EventList from './eventListPage/EventList'
import { adminEventIdAtom, adminEventsAtom, currentAdminEvent } from './recoil'

export const EventListPage = () => {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()
  const selectedEventID = useRecoilValue(adminEventIdAtom)
  const selectedEvent = useRecoilValue(currentAdminEvent)
  const events = useRecoilValue(adminEventsAtom)

  const handleClose = () => {
    setOpen(false)
  }

  const copyAction = async () => {
    /*
    if (selectedEvent) {
      const newEvent: Partial<Event> = cloneDeep({ ...selectedEvent })
      delete newEvent.id
      delete newEvent.kcId
      delete newEvent.state
      delete newEvent.startDate
      delete newEvent.endDate
      delete newEvent.entryStartDate
      delete newEvent.entryEndDate
      asdd.setNewEvent(newEvent)
      navigate(Path.admin.newEvent)
    }
    */
  }

  const deleteAction = async () => {
    /*
    if (selectedEvent) {
      setOpen(false)
      try {
        await actions.deleteEvent(selectedEvent)
        enqueueSnackbar(t('deleteEventComplete'), { variant: 'info' })
      } catch (e: any) {
        enqueueSnackbar(e.message, { variant: 'error' })
      }
    }
    */
  }

  return (
    <>
      <FullPageFlex>
        <TextField sx={{ mt: 2, width: '300px' }} size="small" label="Hae" variant="outlined" disabled />
        <div>
          <FormControlLabel
            sx={{ ml: 0, mb: 2 }}
            value="withUpcomingEntry"
            checked={true}
            disabled
            control={<Switch />}
            label="Näytä myös menneet tapahtumat"
            labelPlacement="start"
          />
        </div>
        <Stack direction="row" spacing={2}>
          <AutoButton startIcon={<AddCircleOutline />} onClick={() => navigate(Path.admin.newEvent)} text={t('createEvent')} />
          <AutoButton startIcon={<EditOutlined />} disabled={!selectedEventID} onClick={() => navigate(`${Path.admin.editEvent}/${selectedEventID}`)} text={t('edit')} />
          <AutoButton startIcon={<ContentCopyOutlined />} disabled={!selectedEventID} onClick={copyAction} text={t('copy')} />
          <AutoButton startIcon={<DeleteOutline />} disabled={!selectedEventID} onClick={() => setOpen(true)} text={t('delete')} />
          <AutoButton startIcon={<FormatListNumberedOutlined />} disabled={!selectedEvent || !selectedEvent.entries} onClick={() => navigate(`${Path.admin.viewEvent}/${selectedEventID}`)} text={t('registrations')} />
        </Stack>
        <EventList events={events}></EventList>
      </FullPageFlex>
      <Dialog
        open={open}
        onClose={handleClose}
        aria-labelledby="delete-dialog-title"
        aria-describedby="delete-dialog-description"
      >
        <DialogTitle id="delete-dialog-title">
          {t('deleteEventTitle')}
        </DialogTitle>
        <DialogContent>
          <DialogContentText id="delete-dialog-description">
            {t('deleteEventText')}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={deleteAction} autoFocus>{t('delete')}</Button>
          <Button onClick={handleClose} variant="outlined">{t('cancel')}</Button>
        </DialogActions>
      </Dialog>
    </>
  )
}
