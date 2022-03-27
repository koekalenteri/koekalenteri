import { Box, Button, Dialog, DialogContent, DialogTitle, Grid, Paper, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { AuthPage } from './AuthPage';
import { useStores } from '../stores';
import { useParams } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { CollapsibleSection, LinkButton, RegistrationForm } from '../components';
import { ADMIN_EVENTS } from '../config';
import { getRegistrations, putRegistration } from '../api/event';
import { BreedCode, ConfirmedEventEx, Registration } from 'koekalenteri-shared/model';
import { DataGrid, GridColDef, GridSelectionModel } from '@mui/x-data-grid';
import { AddCircleOutline, DeleteOutline, EditOutlined, EuroOutlined, PersonOutline } from '@mui/icons-material';
import { format } from 'date-fns';


export function EventViewPage() {
  const params = useParams();
  const { t } = useTranslation();
  const { privateStore } = useStores();
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Registration>();

  useEffect(() => {
    if (!loading) {
      return;
    }
    const abort = new AbortController();
    async function get(id: string) {
      const event = await privateStore.get(id, abort.signal);
      if (privateStore.selectedEvent?.id !== event?.id) {
        privateStore.setSelectedEvent(event);
      }
      const items = await getRegistrations(id, abort.signal);
      setRegistrations(items);
      setLoading(false);
    }
    if (params.id) {
      get(params.id);
    } else {
      setLoading(false);
    }
    return () => abort.abort();
  }, [params, privateStore, loading]);

  const event = (privateStore.selectedEvent || {}) as ConfirmedEventEx;

  const columns: GridColDef[] = [
    {
      field: 'dog.name',
      headerName: t('dog.name'),
      width: 250,
      flex: 1,
      valueGetter: (params) => params.row.dog.name
    },
    {
      field: 'dog.regNo',
      headerName: t('dog.regNo'),
      width: 130,
      valueGetter: (params) => params.row.dog.regNo
    },
    {
      field: 'dob.breed',
      headerName: t('dog.breed'),
      width: 150,
      valueGetter: (params) => t(`breed.${params.row.dog.breedCode as BreedCode}`)
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
      valueGetter: (params) => params.row.handler.name
    },
    {
      field: 'createdAt',
      headerName: t('registration.createdAt'),
      width: 140,
      valueGetter: (params) => t('dateTimeShort', { date: params.value })
    },
    {
      field: 'member',
      headerName: t('registration.member'),
      width: 60,
      align: 'center',
      renderCell: (params) => (params.row.handler.membership ? <PersonOutline fontSize="small" /> : <></>)
    },
    {
      field: 'paid',
      headerName: t('registration.paid'),
      width: 90,
      align: 'center',
      renderCell: (params) => (<EuroOutlined fontSize="small" />)
    }
  ];

  const onSave = async (registration: Registration) => {
    try {
      const saved = await putRegistration(registration);
      const old = registrations.find(r => r.id === saved.id);
      if (old) {
        Object.assign(old, saved);
        setSelected(saved);
      } else {
        setRegistrations(registrations.concat([saved]));
        event.entries++;
      }
      // TODO: update event calsses (infopanel)
      setOpen(false);
      return true;
    } catch (e: any) {
      console.error(e);
      return false;
    }
  }
  const onCancel = async () => {
    setOpen(false);
    return true;
  }

  return (
    <AuthPage>
      <Box sx={{ display: 'flex', p: 1, overflow: 'hidden', height: '100%', flexDirection: 'column', alignItems: 'flex-start' }}>
        <Box sx={{
          display: 'flex',
          flexDirection: 'column',
          flexGrow: 1,
          width: '100%',
          minHeight: 600,
        }}>
          <Grid container justifyContent="space-between">
            <Grid item xs>
              <LinkButton sx={{ mb: 1 }} to={ADMIN_EVENTS} text={t('goBack')} />
              <Title event={event} />
              <CollapsibleSection title="Kokeen tiedot" initOpen={false}>
                  Kokeen tarkat tiedot tähän...
              </CollapsibleSection>
                Filttereitä tähän...
            </Grid>
            <Grid item xs="auto">
              <InfoPanel event={event} />
            </Grid>
          </Grid>
          <Stack direction="row" spacing={2}>
            <Button startIcon={<AddCircleOutline />} onClick={() => { setSelected(undefined); setOpen(true); }}>{t('create')}</Button>
            <Button startIcon={<EditOutlined />} disabled={!selected} onClick={() => setOpen(true)}>{t('edit')}</Button>
            <Button startIcon={<DeleteOutline />} disabled>{t('delete')}</Button>
          </Stack>
          <DataGrid
            loading={loading}
            autoPageSize
            columns={columns}
            density='compact'
            disableColumnMenu
            rows={registrations}
            onSelectionModelChange={(selectionModel: GridSelectionModel) => setSelected(registrations.find(r => r.id === selectionModel[0]))}
            selectionModel={selected ? [selected.id] : []}
            onRowDoubleClick={() => setOpen(true)}
            sx={{
              '& .MuiDataGrid-columnHeaders': {
                backgroundColor: 'background.tableHead'
              },
              '& .MuiDataGrid-row:nth-of-type(2n+1)': {
                backgroundColor: 'background.oddRow'
              },
              '& .MuiDataGrid-cell:focus': {
                outline: 'none'
              },
              '& .MuiDataGrid-row.Mui-selected': {
                backgroundColor: 'background.selected'
              },
              '& .MuiDataGrid-row:hover': {
                backgroundColor: undefined
              },
              '& .MuiDataGrid-row.Mui-selected:hover': {
                backgroundColor: 'background.hover'
              },
              '& .MuiDataGrid-row:hover > .MuiDataGrid-cell': {
                backgroundColor: 'background.hover'
              }
            }}
          />
        </Box>
        <Dialog
          fullWidth
          maxWidth='md'
          open={open}
          onClose={() => setOpen(false)}
          aria-labelledby="reg-dialog-title"
        >
          <DialogTitle id="reg-dialog-title">{selected ? `${selected.dog.name} / ${selected.handler.name}` : t('create')}</DialogTitle>
          <DialogContent dividers sx={{height: '80vh'}}>
            <RegistrationForm event={event} registration={selected} onSave={onSave} onCancel={onCancel} />
          </DialogContent>
        </Dialog>
      </Box>
    </AuthPage>
  )
}

function Title({ event }: { event: ConfirmedEventEx }) {
  const { t } = useTranslation();
  return (
    <Typography variant="h5">
      {event.eventType}, {t('daterange', { start: event.startDate, end: event.endDate })}, {event.location}
      <Box sx={{ display: 'inline-block', mx: 2, color: '#018786' }}>{t('event.states.confirmed_entryOpen')}</Box>
    </Typography>
  );
}

function InfoPanel({ event }: { event: ConfirmedEventEx }) {
  const { t } = useTranslation();
  return (
    <TableContainer component={Paper} elevation={4} sx={{
      width: 256,
      backgroundColor: 'background.selected',
      p: 1,
      '& .MuiTableCell-root': {py: 0, px: 1}
    }}>
      <Table>
        <TableHead>
          <TableRow>
            <TableCell colSpan={5}><b>Ilmoittautuneita</b></TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {event.classes?.map(c =>
            <TableRow key={c.class + c.date?.toISOString()}>
              <TableCell>{format(c.date || event.startDate, t('dateformatS'))}</TableCell>
              <TableCell>{c.class}</TableCell>
              <TableCell align="right">{c.entries}</TableCell>
              <TableCell>Jäseniä</TableCell>
              <TableCell align="right">{c.members}</TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </TableContainer>
  );
}
