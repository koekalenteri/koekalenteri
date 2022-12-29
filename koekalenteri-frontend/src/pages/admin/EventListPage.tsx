import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { AddCircleOutline, ContentCopyOutlined, DeleteOutline, EditOutlined, FormatListNumberedOutlined } from '@mui/icons-material'
import { Stack } from '@mui/material'
import { useConfirm } from 'material-ui-confirm'
import { useRecoilValue } from 'recoil'

import { AutoButton } from '../../components'
import { Path } from '../../routeConfig'

import FullPageFlex from './components/FullPageFlex'
import EventList from './eventListPage/EventList'
import { adminEventIdAtom, currentAdminEventQuery, filteredAdminEventsQuery, useAdminEventActions } from './recoil'

export const EventListPage = () => {
  const confirm = useConfirm()
  const { t } = useTranslation()
  const navigate = useNavigate()
  const selectedEventID = useRecoilValue(adminEventIdAtom)
  const selectedEvent = useRecoilValue(currentAdminEventQuery)
  const events = useRecoilValue(filteredAdminEventsQuery)
  const actions = useAdminEventActions()

  const deleteAction = () => {
    confirm({ title: t('deleteEventTitle'), description: t('deleteEventText') }).then(() => {
      actions.deleteCurrent()
    })
  }

  const createAction = () => navigate(Path.admin.newEvent)
  const editAction = () => navigate(`${Path.admin.editEvent}/${selectedEventID}`)
  const viewAction = () => navigate(`${Path.admin.viewEvent}/${selectedEventID}`)

  return (
    <FullPageFlex>
      <Stack direction="row" spacing={2}>
        <AutoButton startIcon={<AddCircleOutline />} onClick={createAction} text={t('createEvent')} />
        <AutoButton startIcon={<EditOutlined />} disabled={!selectedEventID} onClick={editAction} text={t('edit')} />
        <AutoButton startIcon={<ContentCopyOutlined />} disabled={!selectedEventID} onClick={actions.copyCurrent} text={t('copy')} />
        <AutoButton startIcon={<DeleteOutline />} disabled={!selectedEventID} onClick={deleteAction} text={t('delete')} />
        <AutoButton startIcon={<FormatListNumberedOutlined />} disabled={!selectedEvent || !selectedEvent.entries} onClick={viewAction} text={t('registrations')} />
      </Stack>
      <EventList events={events}></EventList>
    </FullPageFlex>
  )
}
