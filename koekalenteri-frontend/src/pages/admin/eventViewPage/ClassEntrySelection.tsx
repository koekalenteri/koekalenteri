import { useMemo, useState } from 'react';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { EuroOutlined, PersonOutline } from '@mui/icons-material';
import { Box, Typography } from '@mui/material';
import { GridColDef, GridSelectionModel } from '@mui/x-data-grid';
import { BreedCode, ConfirmedEventEx, Registration } from 'koekalenteri-shared/model';

import { StyledDataGrid } from '../../../components';
import { uniqueDate } from '../../../utils';

import GroupColors, { availableGroups } from './GroupColors';
import GroupHeader from './GroupHeader';
import NoRowsOverlay from './NoRowsOverlay';

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

  const eventGroups = useMemo(() => availableGroups(eventDates), [eventDates])
  const classRegistrations = useMemo(() => registrations.filter(r => r.class === eventClass), [eventClass, registrations])

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

  return (
    <>
      <Typography variant='h5'>Osallistujat</Typography>
      {/* column headers only */}
      <Box sx={{ height: 40, width: '100%', overflow: 'hidden' }}>
        <StyledDataGrid
          columns={participantColumns}
          density='compact'
          disableColumnMenu
          disableVirtualization
          hideFooter
          rows={[]}
          components={{
            NoRowsOverlay: () => null
          }}
        />
      </Box>
      {eventGroups.map((group, index) =>
        <StyledDataGrid
          key={group.date.toDateString() + group.time}
          columns={participantColumns}
          density='compact'
          disableColumnMenu
          hideFooter
          headerHeight={0}
          rows={[]}
          components={{
            Header: () => <GroupHeader eventDates={eventDates} group={group} />,
            NoRowsOverlay: NoRowsOverlay,
          }}
        />
      )}
      < Typography variant='h5' > Ilmoittautuneet</Typography >
      <StyledDataGrid
        columns={entryColumns}
        density='compact'
        disableColumnMenu
        rows={classRegistrations}
        onSelectionModelChange={(selectionModel: GridSelectionModel) => setSelected(classRegistrations.find(r => r.id === selectionModel[0]))}
        selectionModel={selected ? [selected.id] : []}
        onRowDoubleClick={() => setOpen(true)}
        sx={{ flex: eventGroups.length || 1 }}
      />
    </>
  )
}

export default ClassEntrySelection
