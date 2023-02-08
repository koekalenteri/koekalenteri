import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { AddCircleOutline, ContentCopyOutlined, DeleteOutline, EditOutlined, FormatListNumberedOutlined } from '@mui/icons-material'
import { FormControlLabel, Stack, Switch } from '@mui/material'
import { GridSelectionModel } from '@mui/x-data-grid'
import { useConfirm } from 'material-ui-confirm'
import { useRecoilState, useRecoilValue } from 'recoil'

import { Path } from '../../routeConfig'
import StyledDataGrid from '../components/StyledDataGrid'

import FullPageFlex from './components/FullPageFlex'
import { QuickSearchToolbar } from './components/QuickSearchToolbar'
import AutoButton from './eventListPage/AutoButton'
import useEventListColumns from './eventListPage/columns'
import { adminEventFilterTextAtom, adminEventIdAtom, adminShowPastEventsAtom, currentAdminEventSelector, filteredAdminEventsSelector, useAdminEventActions } from './recoil'

export default function EventListPage() {
  const confirm = useConfirm()
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [showPast, setShowPast] = useRecoilState(adminShowPastEventsAtom)
  const [searchText, setSearchText] = useRecoilState(adminEventFilterTextAtom)
  const [selectedEventID, setSelectedEventID] = useRecoilState(adminEventIdAtom)
  const selectedEvent = useRecoilValue(currentAdminEventSelector)
  const events = useRecoilValue(filteredAdminEventsSelector)
  const actions = useAdminEventActions()
  const columns = useEventListColumns()

  const deleteAction = useCallback(() => {
    confirm({ title: t('deleteEventTitle'), description: t('deleteEventText'), confirmationText: t('delete'), cancellationText: t('cancel') }).then(() => {
      actions.deleteCurrent()
    })
  }, [actions, confirm, t])

  const createAction = useCallback(() => navigate(Path.admin.newEvent), [navigate])
  const editAction = useCallback(() => navigate(Path.admin.editEvent(selectedEventID)), [navigate, selectedEventID])
  const viewAction = useCallback(() => navigate(Path.admin.viewEvent(selectedEventID)), [navigate, selectedEventID])

  const handleDoubleClick = useCallback(() => {
    if (!selectedEvent) return
    if (selectedEvent.entries) {
      viewAction()
    } else {
      editAction()
    }
  }, [editAction, selectedEvent, viewAction])

  const handleSelectionModeChange = useCallback((selection: GridSelectionModel) => {
    const value = typeof selection[0] === 'string' ? selection[0] : undefined
    setSelectedEventID(value)
  }, [setSelectedEventID])

  const onChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) =>
    setSearchText(event.target.value), [setSearchText])

  const clearSearch = useCallback(() => setSearchText(''), [setSearchText])
  const toggleShowPast = useCallback((_event: React.SyntheticEvent<Element, Event>, checked: boolean) => setShowPast(checked), [setShowPast])

  return (
    <FullPageFlex>
      <Stack direction="row" spacing={2}>
        <AutoButton startIcon={<AddCircleOutline />} onClick={createAction} text={t('createEvent')} />
        <AutoButton startIcon={<EditOutlined />} disabled={!selectedEventID} onClick={editAction} text={t('edit')} />
        <AutoButton startIcon={<ContentCopyOutlined />} disabled={!selectedEventID} onClick={actions.copyCurrent} text={t('copy')} />
        <AutoButton startIcon={<DeleteOutline />} disabled={!selectedEventID} onClick={deleteAction} text={t('delete')} />
        <AutoButton startIcon={<FormatListNumberedOutlined />} disabled={!selectedEvent || !selectedEvent.entries} onClick={viewAction} text={t('registrations')} />
      </Stack>
      <StyledDataGrid
        columns={columns}
        rows={events}
        onSelectionModelChange={handleSelectionModeChange}
        components={{ Toolbar: QuickSearchToolbar }}
        componentsProps={{
          toolbar: {
            value: searchText,
            onChange,
            clearSearch,
            columnSelector: true,
            children: <FormControlLabel
              sx={{ m: 0 }}
              checked={showPast}
              control={<Switch size='small' />}
              label="Näytä myös menneet tapahtumat"
              labelPlacement="start"
              onChange={toggleShowPast}
            />,
          },
        }}
        selectionModel={selectedEventID ? [selectedEventID] : []}
        onRowDoubleClick={handleDoubleClick}
      />
    </FullPageFlex>
  )
}
