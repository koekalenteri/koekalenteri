import { useCallback, useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import {
  AddCircleOutline,
  ContentCopyOutlined,
  DeleteOutline,
  EditOutlined,
  FormatListNumberedOutlined,
} from '@mui/icons-material'
import { FormControlLabel, Stack, Switch } from '@mui/material'
import { GridSelectionModel } from '@mui/x-data-grid'
import { useConfirm } from 'material-ui-confirm'
import { useRecoilState, useRecoilValue } from 'recoil'

import { Path } from '../../routeConfig'
import AutocompleteSingle from '../components/AutocompleteSingle'
import StyledDataGrid from '../components/StyledDataGrid'

import FullPageFlex from './components/FullPageFlex'
import { QuickSearchToolbar, QuickSearchToolbarProps } from './components/QuickSearchToolbar'
import AutoButton from './eventListPage/AutoButton'
import useEventListColumns from './eventListPage/columns'
import { adminUserFilteredEventsSelector, adminUserOrganizersSelector } from './recoil/user'
import {
  adminEventFilterTextAtom,
  adminEventIdAtom,
  adminShowPastEventsAtom,
  currentAdminEventSelector,
  selectedOrganizerIdAtom,
  useAdminEventActions,
} from './recoil'

const Toolbar = (props: QuickSearchToolbarProps) => {
  const orgs = useRecoilValue(adminUserOrganizersSelector)
  const [orgId, setOrgId] = useRecoilState(selectedOrganizerIdAtom)
  const options = useMemo(() => [{ id: '', name: 'Kaikki' }, ...orgs], [orgs])

  useEffect(() => {
    if (orgs.length === 1) {
      setOrgId(orgs[0].id)
    }
  }, [orgs, setOrgId])

  return (
    <QuickSearchToolbar {...props}>
      <AutocompleteSingle
        disabled={orgs.length < 2}
        size="small"
        options={options}
        label={'Yhdistys'}
        getOptionLabel={(o) => o.name}
        renderOption={(props, option) => {
          return (
            <li {...props} key={option.id}>
              {option.name}
            </li>
          )
        }}
        value={options.find((o) => o.id === orgId) ?? null}
        onChange={(o) => setOrgId(o?.id ?? '')}
      ></AutocompleteSingle>
    </QuickSearchToolbar>
  )
}

export default function EventListPage() {
  const confirm = useConfirm()
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [showPast, setShowPast] = useRecoilState(adminShowPastEventsAtom)
  const [searchText, setSearchText] = useRecoilState(adminEventFilterTextAtom)
  const [selectedEventID, setSelectedEventID] = useRecoilState(adminEventIdAtom)
  const selectedEvent = useRecoilValue(currentAdminEventSelector)
  const events = useRecoilValue(adminUserFilteredEventsSelector)
  const actions = useAdminEventActions()
  const columns = useEventListColumns()

  const deleteAction = useCallback(() => {
    confirm({
      title: t('confirmTitle'),
      description: t('deleteEventText'),
      confirmationText: t('delete'),
      cancellationText: t('cancel'),
      cancellationButtonProps: { variant: 'outlined' },
      confirmationButtonProps: { autoFocus: true, variant: 'contained' },
      dialogActionsProps: {
        sx: {
          flexDirection: 'row-reverse',
          justifyContent: 'flex-start',
        },
      },
    }).then(async () => {
      await actions.deleteCurrent()
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

  const handleSelectionModeChange = useCallback(
    (selection: GridSelectionModel) => {
      const value = typeof selection[0] === 'string' ? selection[0] : undefined
      setSelectedEventID(value)
    },
    [setSelectedEventID]
  )

  const onChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => setSearchText(event.target.value),
    [setSearchText]
  )

  const clearSearch = useCallback(() => setSearchText(''), [setSearchText])
  const toggleShowPast = useCallback(
    (_event: React.SyntheticEvent<Element, Event>, checked: boolean) => setShowPast(checked),
    [setShowPast]
  )

  return (
    <FullPageFlex>
      <Stack direction="row" spacing={2}>
        <AutoButton startIcon={<AddCircleOutline />} onClick={createAction} text={t('createEvent')} />
        <AutoButton startIcon={<EditOutlined />} disabled={!selectedEventID} onClick={editAction} text={t('edit')} />
        <AutoButton
          startIcon={<ContentCopyOutlined />}
          disabled={!selectedEventID}
          onClick={actions.copyCurrent}
          text={t('copy')}
        />
        <AutoButton
          startIcon={<DeleteOutline />}
          disabled={!selectedEventID}
          onClick={deleteAction}
          text={t('delete')}
        />
        <AutoButton
          startIcon={<FormatListNumberedOutlined />}
          disabled={!selectedEvent?.entries}
          onClick={viewAction}
          text={t('registrations')}
        />
      </Stack>
      <StyledDataGrid
        columns={columns}
        rows={events}
        onSelectionModelChange={handleSelectionModeChange}
        components={{ Toolbar: Toolbar }}
        componentsProps={{
          toolbar: {
            value: searchText,
            onChange,
            clearSearch,
            columnSelector: true,
            children: (
              <FormControlLabel
                sx={{ m: 0 }}
                checked={showPast}
                control={<Switch size="small" />}
                label="Näytä myös menneet tapahtumat"
                labelPlacement="start"
                onChange={toggleShowPast}
              />
            ),
          },
        }}
        selectionModel={selectedEventID ? [selectedEventID] : []}
        onRowDoubleClick={handleDoubleClick}
      />
    </FullPageFlex>
  )
}
