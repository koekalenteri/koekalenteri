import type { GridRowSelectionModel } from '@mui/x-data-grid'
import type { DogEvent } from '../../types'
import AddCircleOutline from '@mui/icons-material/AddCircleOutline'
import ContentCopyOutlined from '@mui/icons-material/ContentCopyOutlined'
import DeleteOutline from '@mui/icons-material/DeleteOutline'
import EditOutlined from '@mui/icons-material/EditOutlined'
import FormatListNumberedOutlined from '@mui/icons-material/FormatListNumberedOutlined'
import FormControlLabel from '@mui/material/FormControlLabel'
import Stack from '@mui/material/Stack'
import Switch from '@mui/material/Switch'
import { useAtom, useAtomValue } from 'jotai'
import { useResetAtom } from 'jotai/utils'
import { useConfirm } from 'material-ui-confirm'
import { useCallback, useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'
import { formatDistance } from '../../i18n/dates'
import { isDevEnv } from '../../lib/env'
import { hasEntryStarted, isEventDeletable } from '../../lib/event'
import { isConfirmedEvent } from '../../lib/typeGuards'
import { Path } from '../../routeConfig'
import AutocompleteSingle from '../components/AutocompleteSingle'
import StyledDataGrid from '../components/StyledDataGrid'
import { useRecentUpdateRowClassName } from '../state/recentUpdates'
import FullPageFlex from './components/FullPageFlex'
import { QuickSearchToolbar } from './components/QuickSearchToolbar'
import AutoButton from './eventListPage/AutoButton'
import useEventListColumns from './eventListPage/columns'
import {
  adminCurrentEventAtom,
  adminEventColumnsAtom,
  adminEventFilterTextAtom,
  adminEventIdAtom,
  adminEventOrganizerIdAtom,
  adminNewEventAtom,
  adminShowPastEventsAtom,
  useAdminEventActions,
} from './state'
import { adminUserEventOrganizersAtom, adminUserFilteredEventsAtom } from './state/derivedAtoms'

export const canViewEvent = (event?: Pick<DogEvent, 'state'>): boolean => isConfirmedEvent(event)

export const getEventDoubleClickPath = (
  event: Pick<DogEvent, 'entries' | 'entryStartDate' | 'id' | 'state'>,
  now = new Date()
): string =>
  canViewEvent(event) && (hasEntryStarted(event, now) || (event.entries ?? 0) > 0)
    ? Path.admin.viewEvent(event.id)
    : Path.admin.editEvent(event.id)

export default function EventListPage() {
  const confirm = useConfirm()
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [showPast, setShowPast] = useAtom(adminShowPastEventsAtom)
  const [searchText, setSearchText] = useAtom(adminEventFilterTextAtom)
  const [selectedEventID, setSelectedEventID] = useAtom(adminEventIdAtom)
  const [visibilityModel, setVisibilityModel] = useAtom(adminEventColumnsAtom)
  const selectedEvent = useAtomValue(adminCurrentEventAtom)
  const actions = useAdminEventActions()
  const columns = useEventListColumns()
  const orgs = useAtomValue(adminUserEventOrganizersAtom)
  const [orgId, setOrgId] = useAtom(adminEventOrganizerIdAtom)
  const getRowClassName = useRecentUpdateRowClassName('admin:event')
  // order matters here, need to use dependencies before this one
  const events = useAtomValue(adminUserFilteredEventsAtom)
  const options = useMemo(() => [{ id: '', name: 'Kaikki' }, ...orgs], [orgs])
  const newEvent = useAtomValue(adminNewEventAtom)
  const resetNewEvent = useResetAtom(adminNewEventAtom)

  const deleteAction = useCallback(() => {
    confirm({
      cancellationText: t('cancel'),
      confirmationText: t('delete'),
      description: t('deleteEventText'),
      title: t('confirmTitle'),
    }).then(async ({ confirmed }) => {
      if (confirmed) {
        await actions.deleteCurrent()
      }
    })
  }, [actions, confirm, t])

  const createAction = useCallback(() => {
    if (newEvent.modifiedAt) {
      confirm({
        cancellationText: 'Luo uusi tapahtuma',
        confirmationText: 'Jatka muokkausta',
        description: `Sinulla on tallentamaton tapahtuman luonnos (muokattu ${formatDistance(
          newEvent.modifiedAt,
          'fi'
        )} sitten). Haluatko jatkaa muokkaamista vai luoda kokonaan uuden tapahtuman?`,
        title: t('confirmTitle'),
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
    navigate(getEventDoubleClickPath(selectedEvent))
  }, [navigate, selectedEvent])

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
    } else if (!orgs.some((org) => org.id === orgId)) {
      setOrgId('')
    }
  }, [orgId, orgs, setOrgId])

  return (
    <FullPageFlex>
      <Stack direction="row" spacing={{ sm: 2, xs: 0 }}>
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
          disabled={!selectedEventID || !canViewEvent(selectedEvent)}
          onClick={viewAction}
          text={t('registrations')}
        />
      </Stack>
      <StyledDataGrid
        autoPageSize
        columns={columns}
        columnVisibilityModel={visibilityModel}
        getRowClassName={getRowClassName}
        onColumnVisibilityModelChange={setVisibilityModel}
        onRowDoubleClick={handleDoubleClick}
        onRowSelectionModelChange={handleSelectionModeChange}
        rows={events}
        rowSelectionModel={selectedEventID ? [selectedEventID] : []}
        slots={{ toolbar: QuickSearchToolbar }}
        slotProps={{
          toolbar: {
            children: (
              // The organizer picker keeps a usable width and the switch keeps its label on one line; where
              // both do not fit side by side, the switch drops to the next row, at the right edge.
              <Stack direction="row" mx={1} flex={1} flexWrap="wrap" useFlexGap sx={{ rowGap: 0.5 }}>
                <AutocompleteSingle
                  disabled={orgs.length < 2}
                  size="small"
                  sx={{ flex: '1 1 200px' }}
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
                  sx={{ m: 0, ml: 'auto', pl: 1 }}
                  checked={showPast}
                  control={<Switch size="small" />}
                  label="Näytä myös menneet tapahtumat"
                  labelPlacement="start"
                  name="showPast"
                  onChange={toggleShowPast}
                  slotProps={{ typography: { noWrap: true } }}
                />
              </Stack>
            ),
            clearSearch,
            columnSelector: true,
            onChange,
            value: searchText,
          },
        }}
      />
    </FullPageFlex>
  )
}
