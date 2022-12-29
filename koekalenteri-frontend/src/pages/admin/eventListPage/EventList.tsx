import React from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { Box, FormControlLabel, Stack, Switch } from '@mui/material'
import { GridColDef } from '@mui/x-data-grid'
import { EventClass, EventEx, EventState } from 'koekalenteri-shared/model'
import { useRecoilState } from 'recoil'

import { QuickSearchToolbar, StyledDataGrid } from '../../../components'
import { Path } from '../../../routeConfig'
import { useJudgesActions } from '../../recoil/judges'
import { adminEventFilterTextAtom, adminEventIdAtom, adminShowPastEventsAtom } from '../recoil'

interface EventListColDef extends GridColDef {
  field: keyof EventEx | 'date'
}

type StartEndDate = { start: Date, end: Date }

interface Props {
  events: Partial<EventEx>[]
}

const EventList = ({ events }: Props) => {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [showPast, setShowPast] = useRecoilState(adminShowPastEventsAtom)
  const [searchText, setSearchText] = useRecoilState(adminEventFilterTextAtom)
  const [selectedEventID, setSelectedEventID] = useRecoilState(adminEventIdAtom)
  const judgeActions = useJudgesActions()

  const columns: EventListColDef[] = [
    {
      align: 'right',
      field: 'date',
      headerName: t('date') ?? undefined,
      width: 120,
      sortComparator: (a, b) => (b as StartEndDate).start.valueOf() - (a as StartEndDate).start.valueOf(),
      valueGetter: (params) => ({ start: params.row.startDate, end: params.row.endDate }),
      valueFormatter: ({value}) => t('daterange', value as StartEndDate),
    },
    {
      field: 'eventType',
      headerName: t('event.eventType') ?? undefined,
      minWidth: 100,
    },
    {
      field: 'classes',
      headerName: t('event.classes') ?? undefined,
      minWidth: 100,
      flex: 1,
      valueGetter: (params) => ((params.row.classes || []) as Array<EventClass|string>).map(c => typeof c === 'string' ? c : c.class).join(', '),
    },
    {
      field: 'location',
      headerName: t('event.location') ?? undefined,
      minWidth: 100,
      flex: 1,
    },
    {
      field: 'official',
      headerName: t('event.official') ?? undefined,
      minWidth: 100,
      flex: 1,
      valueGetter: (params) => params.row.official?.name,
    },
    {
      field: 'judges',
      headerName: t('judgeChief') ?? undefined,
      minWidth: 100,
      flex: 1,
      valueGetter: (params) => params.row.judges && judgeActions.find(params.row.judges[0])?.name,
    },
    {
      field: 'places',
      headerName: t('places') ?? undefined,
      align: 'right',
      width: 80,
      valueGetter: (params) => `${params.row.entries} / ${params.row.places}`,
    },
    {
      field: 'state',
      headerName: t('event.state') ?? undefined,
      flex: 1,
      type: 'string',
      valueGetter: (params) => {
        const event: EventEx = params.row
        if (event.isEntryOpen) {
          return t('event.states.confirmed_entryOpen')
        }
        if (event.isEntryClosed) {
          return t('event.states.confirmed_entryClosed')
        }
        if (event.isEventOngoing) {
          return t('event.states.confirmed_eventOngoing')
        }
        if (event.isEventOver) {
          return t('event.states.confirmed_eventOver')
        }
        return t(`event.states.${(params.value || 'draft') as EventState}`)
      },
    },
  ]

  const handleDoubleClick = () => {
    if (!selectedEventID) return
    // navigate(`${event.entries ? Path.admin.viewEvent : Path.admin.editEvent}/${event.id}`)
    navigate(`${Path.admin.viewEvent}/${selectedEventID}`)
  }

  return (
    <Box sx={{
      display: 'flex',
      flexDirection: 'column',
      flexGrow: 1,
      width: '100%',
      minHeight: 300,
    }}>
      <StyledDataGrid
        autoPageSize
        columns={columns}
        density='compact'
        disableColumnMenu
        rows={events}
        onSelectionModelChange={(selection) => {
          const value = typeof selection[0] === 'string' ? selection[0] : undefined
          setTimeout(() => setSelectedEventID(value), 0)
        }}
        components={{ Toolbar: QuickSearchToolbar }}
        componentsProps={{
          toolbar: {
            value: searchText,
            onChange: (event: React.ChangeEvent<HTMLInputElement>) =>
              setSearchText(event.target.value),
            clearSearch: () => setSearchText(''),
            children: <FormControlLabel
              sx={{ ml: 0, mb: 2 }}
              checked={showPast}
              control={<Switch />}
              label="Näytä myös menneet tapahtumat"
              labelPlacement="start"
              onChange={(_event, checked) => setShowPast(checked)}
            />,
          },
        }}
        selectionModel={selectedEventID ? [selectedEventID] : []}
        onRowDoubleClick={() => handleDoubleClick()}
      />
    </Box>
  )
}

export default EventList
