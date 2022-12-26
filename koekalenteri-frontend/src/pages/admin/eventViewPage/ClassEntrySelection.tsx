import { useMemo, useState } from 'react';
import React from 'react';
import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { useTranslation } from 'react-i18next';
import { EuroOutlined, PersonOutline } from '@mui/icons-material';
import { Box, Typography } from '@mui/material';
import { GridColDef, GridRowId, GridSelectionModel } from '@mui/x-data-grid';
import { BreedCode, ConfirmedEventEx, Registration, RegistrationDate } from 'koekalenteri-shared/model';

import { StyledDataGrid } from '../../../components';
import { uniqueDate } from '../../../utils';

import DragableDataGrid from './classEntrySelection/DropableDataGrid'
import GroupColors, { availableGroups } from './classEntrySelection/GroupColors';
import GroupHeader from './classEntrySelection/GroupHeader';
import NoRowsOverlay from './classEntrySelection/NoRowsOverlay';

interface Props {
  event: ConfirmedEventEx
  eventClass: string
  registrations: Registration[]
  setOpen: React.Dispatch<React.SetStateAction<boolean>>
}

const ClassEntrySelection = ({ event, eventClass, registrations, setOpen }: Props) => {
  const { t } = useTranslation();
  const { t: breed } = useTranslation('breed');
  const [selected, setSelected] = useState<Registration>();

  const eventDates = useMemo(
    () => uniqueDate(
      event.classes?.filter(c => c.class === eventClass)
        .map(c => c.date || event.startDate)
    ), [event.classes, event.startDate, eventClass])

  interface RegistrationGroup extends RegistrationDate {
    key: string
  }

  const [groupRegistrations, setGroupRegistrations] = useState<Record<string, Registration[]>>({reserve: [...registrations]})
  const eventGroups: RegistrationGroup[] = useMemo(() => availableGroups(eventDates).map(group => ({...group, key: group.date.toISOString().slice(0,10) + '|' + group.time})) , [eventDates])

  const entryColumns: GridColDef[] = [
    {
      field: 'dates',
      headerName: '',
      width: 32,
      renderCell: (p) => <GroupColors dates={eventDates} selected={p.row.dates} />
    },
    {
      field: 'dog.name',
      headerName: t('dog.name'),
      width: 250,
      flex: 1,
      valueGetter: (p) => p.row.dog.name
    },
    {
      field: 'dog.regNo',
      headerName: t('dog.regNo'),
      width: 130,
      valueGetter: (p) => p.row.dog.regNo
    },
    {
      field: 'dob.breed',
      headerName: t('dog.breed'),
      width: 150,
      valueGetter: (p) => breed(`${p.row.dog.breedCode as BreedCode}`)
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
      valueGetter: (p) => p.row.handler.name
    },
    {
      field: 'createdAt',
      headerName: t('registration.createdAt'),
      width: 140,
      valueGetter: (p) => t('dateTimeShort', { date: p.value })
    },
    {
      field: 'member',
      headerName: t('registration.member'),
      width: 60,
      align: 'center',
      renderCell: (p) => (p.row.handler.membership ? <PersonOutline fontSize="small" /> : <></>)
    },
    {
      field: 'paid',
      headerName: t('registration.paid'),
      width: 90,
      align: 'center',
      renderCell: () => (<EuroOutlined fontSize="small" />)
    }
  ];

  const participantColumns: GridColDef[] = [
    ...entryColumns,
    {
      field: 'comment',
      headerName: 'Kommentti',
      width: 90
    }
  ]

  if (!event.isEntryClosed) {
    return null
  }

  const handleDrop = (group: RegistrationGroup) => (item: { id: GridRowId }) => {
    setGroupRegistrations(prev => {
      const newGroups: Record<string, Registration[]> = {}
      const keys = Object.keys(prev)
      let reg: Registration | undefined
      for (const key of keys) {
        const found = prev[key].find(r => r.id === item.id)
        if (found) {
          newGroups[key] = prev[key].filter(r => r.id !== item.id)
          reg = found
          console.log(key, newGroups[key].length)
        } else {
          newGroups[key] = [...prev[key]]
        }
      }
      if (!reg) {
        console.log('not found', item, group)
        return prev
      }
      if (!(group.key in newGroups)) {
        newGroups[group.key] = []
      }
      newGroups[group.key].push(reg)
      console.log(newGroups)
      return newGroups
    })
  }

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
            NoRowsOverlay: () => null
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
          rows={groupRegistrations[group.key] ?? []}
          components={{
            Header: () => <GroupHeader eventDates={eventDates} group={group} />,
            NoRowsOverlay: NoRowsOverlay,
          }}
          onDrop={handleDrop(group)}
        />
      )}
      < Typography variant='h5' > Ilmoittautuneet</Typography >
      <DragableDataGrid
        columns={entryColumns}
        density='compact'
        disableColumnMenu
        rows={groupRegistrations.reserve}
        onSelectionModelChange={(selectionModel: GridSelectionModel) => setSelected(registrations.find(r => r.id === selectionModel[0]))}
        selectionModel={selected ? [selected.id] : []}
        onRowDoubleClick={() => setOpen(true)}
        sx={{ flex: eventGroups.length || 1 }}
      />
    </DndProvider>
  )
}

export default ClassEntrySelection
