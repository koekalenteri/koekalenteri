import type { GridRowSelectionModel } from '@mui/x-data-grid'

import { useCallback, useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'
import AddCircleOutline from '@mui/icons-material/AddCircleOutline'
import ContentCopyOutlined from '@mui/icons-material/ContentCopyOutlined'
import DeleteOutline from '@mui/icons-material/DeleteOutline'
import EditOutlined from '@mui/icons-material/EditOutlined'
import FormatListNumberedOutlined from '@mui/icons-material/FormatListNumberedOutlined'
import FormControlLabel from '@mui/material/FormControlLabel'
import Stack from '@mui/material/Stack'
import Switch from '@mui/material/Switch'
import { useConfirm } from 'material-ui-confirm'
import { useRecoilState, useRecoilValue, useResetRecoilState } from 'recoil'

import { formatDistance } from '../../i18n/dates'
import { isDevEnv } from '../../lib/env'
import { isEventDeletable } from '../../lib/event'
import { Path } from '../../routeConfig'
import AutocompleteSingle from '../components/AutocompleteSingle'
import StyledDataGrid from '../components/StyledDataGrid'

import FullPageFlex from './components/FullPageFlex'
import { QuickSearchToolbar } from './components/QuickSearchToolbar'
import AutoButton from './eventListPage/AutoButton'
import useEventListColumns from './eventListPage/columns'
import { adminUserEventOrganizersSelector, adminUserFilteredEventsSelector } from './recoil/user'
import {
  adminCurrentEventSelector,
  adminEventColumnsAtom,
  adminEventFilterTextAtom,
  adminEventIdAtom,
  adminEventOrganizerIdAtom,
  adminNewEventAtom,
  adminShowPastEventsAtom,
  useAdminEventActions,
} from './recoil'

export default function EventListPage() {
  const confirm = useConfirm()
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [showPast, setShowPast] = useRecoilState(adminShowPastEventsAtom)
  const [searchText, setSearchText] = useRecoilState(adminEventFilterTextAtom)
  const [selectedEventID, setSelectedEventID] = useRecoilState(adminEventIdAtom)
  const [visibilityModel, setVisibilityModel] = useRecoilState(adminEventColumnsAtom)
  const selectedEvent = useRecoilValue(adminCurrentEventSelector)
  const actions = useAdminEventActions()
  const columns = useEventListColumns()
  const orgs = useRecoilValue(adminUserEventOrganizersSelector)
  const [orgId, setOrgId] = useRecoilState(adminEventOrganizerIdAtom)
  // order matters here, need to use dependencies before this one
  const events = useRecoilValue(adminUserFilteredEventsSelector)
  const options = useMemo(() => [{ id: '', name: 'Kaikki' }, ...orgs], [orgs])
  const newEvent = useRecoilValue(adminNewEventAtom)
  const resetNewEvent = useResetRecoilState(adminNewEventAtom)

  const deleteAction = useCallback(() => {
    confirm({
      title: t('confirmTitle'),
      description: t('deleteEventText'),
      confirmationText: t('delete'),
      cancellationText: t('cancel'),
    }).then(async ({ confirmed }) => {
      if (confirmed) {
        await actions.deleteCurrent()
      }
    })
  }, [actions, confirm, t])

  const createAction = useCallback(() => {
    if (newEvent.modifiedAt) {
      confirm({
        title: t('confirmTitle'),
        description: `Sinulla on tallentamaton tapahtuman luonnos (muokattu ${formatDistance(
          newEvent.modifiedAt,
          'fi'
        )} sitten). Haluatko jatkaa muokkaamista vai luoda kokonaan uuden tapahtuman?`,
        confirmationText: 'Jatka muokkausta',
        cancellationText: 'Luo uusi tapahtuma',
      }).then(async ({ confirmed }) => {
        if (!confirmed) {
          resetNewEvent()
        }
        navigate(Path.admin.newEvent)
      })
    } else {
      navigate(Path.admin.newEvent)
    }
  }, [confirm, navigate, newEvent.modifiedAt, resetNewEvent, t])
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
    (selection: GridRowSelectionModel) => {
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

  useEffect(() => {
    if (orgs.length === 1) {
      setOrgId(orgs[0].id)
    } else if (!orgs.find((org) => org.id === orgId)) {
      setOrgId('')
    }
  }, [orgId, orgs, setOrgId])

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
        {isDevEnv() && (
          <AutoButton
            startIcon={<ContentCopyOutlined />}
            disabled={!selectedEventID}
            onClick={actions.copyCurrentTest}
            text={t('copyTest')}
          />
        )}
        <AutoButton
          startIcon={<DeleteOutline />}
          disabled={!selectedEventID || !isEventDeletable(selectedEvent)}
          onClick={deleteAction}
          text={t('delete')}
        />
        <AutoButton
          startIcon={<FormatListNumberedOutlined />}
          disabled={!selectedEventID}
          onClick={viewAction}
          text={t('registrations')}
        />
      </Stack>
      <StyledDataGrid
        autoPageSize
        columns={columns}
        columnVisibilityModel={visibilityModel}
        onColumnVisibilityModelChange={setVisibilityModel}
        onRowDoubleClick={handleDoubleClick}
        onRowSelectionModelChange={handleSelectionModeChange}
        rows={events}
        rowSelectionModel={selectedEventID ? [selectedEventID] : []}
        slots={{ toolbar: QuickSearchToolbar }}
        slotProps={{
          toolbar: {
            value: searchText,
            onChange,
            clearSearch,
            columnSelector: true,
            children: (
              <Stack direction="row" mx={1} flex={1}>
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
                <FormControlLabel
                  sx={{ m: 0, pl: 1 }}
                  checked={showPast}
                  control={<Switch size="small" />}
                  label="Näytä myös menneet tapahtumat"
                  labelPlacement="start"
                  name="showPast"
                  onChange={toggleShowPast}
                />
              </Stack>
            ),
          },
        }}
      />
    </FullPageFlex>
  )
}
