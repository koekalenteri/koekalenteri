import { Dispatch, SetStateAction, useCallback, useMemo } from 'react'
import { DndProvider } from 'react-dnd'
import { HTML5Backend } from 'react-dnd-html5-backend'
import { useTranslation } from 'react-i18next'
import { EuroOutlined, PersonOutline } from '@mui/icons-material'
import { Box, Typography } from '@mui/material'
import { GridColDef, GridRowId, GridSelectionModel } from '@mui/x-data-grid'
import { BreedCode, Registration, RegistrationGroup } from 'koekalenteri-shared/model'
import { useRecoilState, useRecoilValue } from 'recoil'

import { StyledDataGrid } from '../../../components'
import { adminRegistrationIdAtom, currentEventClassRegistrationsQuery } from '../recoil'

import DragableDataGrid from './classEntrySelection/DropableDataGrid'
import GroupColors, { availableGroups } from './classEntrySelection/GroupColors'
import GroupHeader from './classEntrySelection/GroupHeader'
import NoRowsOverlay from './classEntrySelection/NoRowsOverlay'

interface Props {
  eventDates: Date[]
  setOpen: Dispatch<SetStateAction<boolean>>
}

const ClassEntrySelection = ({ eventDates = [], setOpen }: Props) => {
  const { t } = useTranslation()
  const { t: breed } = useTranslation('breed')
  const registrations = useRecoilValue(currentEventClassRegistrationsQuery)
  const [selectedRegistrationID, setSelectedRegistrationID] = useRecoilState(adminRegistrationIdAtom)

  const eventGroups: RegistrationGroup[] = useMemo(() => availableGroups(eventDates).map(eventDate => ({ ...eventDate, key: eventDate.date.toISOString().slice(0, 10) + '|' + eventDate.time, number: 0 })), [eventDates])
  const registrationsByGroup: Record<string, Registration[]> = useMemo(() => {
    const byGroup: Record<string, Registration[]> = { reserve: [] }
    for (const group of eventGroups) {
      byGroup[group.key] = []
    }
    for (const reg of registrations) {
      const key = reg.group?.key ?? 'reserve'
      byGroup[key] = byGroup[key] || [] // make sure the array exists
      byGroup[key].push(reg)
    }
    return byGroup
  }, [eventGroups, registrations])

  const entryColumns: GridColDef[] = [
    {
      field: 'dates',
      headerName: '',
      width: 32,
      renderCell: (p) => <GroupColors dates={eventDates} selected={p.row.dates} />,
    },
    {
      field: 'dog.name',
      headerName: t('dog.name'),
      width: 250,
      flex: 1,
      valueGetter: (p) => p.row.dog.name,
    },
    {
      field: 'dog.regNo',
      headerName: t('dog.regNo'),
      width: 130,
      valueGetter: (p) => p.row.dog.regNo,
    },
    {
      field: 'dob.breed',
      headerName: t('dog.breed'),
      width: 150,
      valueGetter: (p) => breed(`${p.row.dog.breedCode as BreedCode}`),
    },
    {
      field: 'class',
      width: 90,
      headerName: t('eventClass'),
    },
    {
      field: 'handler',
      headerName: t('registration.handler'),
      width: 150,
      flex: 1,
      valueGetter: (p) => p.row.handler.name,
    },
    {
      field: 'createdAt',
      headerName: t('registration.createdAt'),
      width: 140,
      valueGetter: (p) => t('dateTimeShort', { date: p.value }),
    },
    {
      field: 'member',
      headerName: t('registration.member'),
      width: 60,
      align: 'center',
      renderCell: (p) => (p.row.handler.membership ? <PersonOutline fontSize="small" /> : <></>),
    },
    {
      field: 'paid',
      headerName: t('registration.paid'),
      width: 90,
      align: 'center',
      renderCell: () => (<EuroOutlined fontSize="small" />),
    },
  ]

  const participantColumns: GridColDef[] = [
    ...entryColumns,
    {
      field: 'comment',
      headerName: 'Kommentti',
      width: 90,
    },
  ]

  const handleDrop = (group: RegistrationGroup) => (item: { id: GridRowId }) => {
    const reg = registrations.find(r => r.id === item.id)
    if (reg) {
      reg.setGroup({ ...group, number: 1 })
    }
  }

  const handleSelectionModeChange = useCallback((selection: GridSelectionModel) => {
    const value = typeof selection[0] === 'string' ? selection[0] : undefined
    setSelectedRegistrationID(value)
  }, [setSelectedRegistrationID])

  const handleDoubleClick = useCallback(() => setOpen(true), [setOpen])

  return (
    <DndProvider backend={HTML5Backend}>
      <Typography variant='h5'>Osallistujat</Typography>
      {/* column headers only */}
      <Box sx={{ height: 40, flexShrink: 0, width: '100%', overflow: 'hidden' }}>
        <StyledDataGrid
          columns={participantColumns}
          density='compact'
          disableColumnMenu
          hideFooter
          rows={[]}
          components={{
            NoRowsOverlay: NullComponent,
          }}
        />
      </Box>
      {eventGroups.map((group) =>
        <DragableDataGrid
          key={group.key}
          columns={participantColumns}
          density='compact'
          disableColumnMenu
          hideFooter
          headerHeight={0}
          rows={registrationsByGroup[group.key] ?? []}
          components={{
            Header: GroupHeader,
            NoRowsOverlay: NoRowsOverlay,
          }}
          componentsProps={{
            header: {
              eventDates: eventDates,
              group: group,
            },
          }}
          onDrop={handleDrop(group)}
        />,
      )}
      < Typography variant='h5' > Ilmoittautuneet</Typography >
      <DragableDataGrid
        columns={entryColumns}
        density='compact'
        disableColumnMenu
        rows={registrationsByGroup.reserve}
        onSelectionModelChange={handleSelectionModeChange}
        selectionModel={selectedRegistrationID ? [selectedRegistrationID] : []}
        onRowDoubleClick={handleDoubleClick}
        sx={{ flex: eventGroups.length || 1 }}
      />
    </DndProvider>
  )
}

function NullComponent() {
  return null
}

export default ClassEntrySelection
