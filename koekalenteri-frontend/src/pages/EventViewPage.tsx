import { Box, CircularProgress, Dialog, DialogContent, DialogContentText, DialogProps, DialogTitle, Grid, Paper, Typography } from '@mui/material';
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
import { EuroOutlined, PersonOutline } from '@mui/icons-material';


export function EventViewPage() {
  const params = useParams();
  const { t } = useTranslation();
  const { privateStore } = useStores();
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Registration>();

  useEffect(() => {
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
  }, [params, privateStore]);

  const event = privateStore.selectedEvent || {};

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
      }
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
      {loading
        ? <CircularProgress />
        :
        <Box sx={{ p: 1, overflow: 'hidden', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
          <Box sx={{
            display: 'flex',
            flexDirection: 'column',
            flexGrow: 1,
            width: '100%',
            minHeight: 600,
          }}>
            <Grid container justifyContent="space-between">
              <Grid item xs>
                <LinkButton sx={{mb: 1}} to={ADMIN_EVENTS} text={t('goBack')} />
                <Typography variant="h5">
                  {event.eventType}, {t('daterange', { start: event.startDate, end: event.endDate })}, {event.location}
                  <Box sx={{ display: 'inline-block', mx: 2, color: '#018786' }}>{t('event.states.confirmed_entryOpen')}</Box>
                </Typography>

                <CollapsibleSection title="Kokeen tiedot" initOpen={false}>
                  Kokeen tarkat tiedot tähän...
                </CollapsibleSection>
                Filttereitä tähän...
              </Grid>
              <Grid item xs="auto">
                <Paper sx={{height: 128, width: 256, background: '#D5E1DB', p: 1}}>Infopaneeli tähän...</Paper>
              </Grid>
            </Grid>
            Nappuloita tähän...
            <DataGrid
              autoPageSize
              columns={columns}
              density='compact'
              disableColumnMenu
              rows={registrations}
              onSelectionModelChange={(selectionModel: GridSelectionModel) => setSelected(registrations.find(r => r.id === selectionModel[0]))}
              selectionModel={selected ? [selected.id] : []}
              onRowDoubleClick={(params) => setOpen(true)}
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
            <DialogTitle id="scroll-dialog-title">{selected?.dog.name} / {selected?.handler.name}</DialogTitle>
            <DialogContent dividers sx={{height: '80vh', overflow: 'hidden', p: 1, pb: 6}}>
              <RegistrationForm event={event as ConfirmedEventEx} registration={selected} onSave={onSave} onCancel={onCancel} />
            </DialogContent>
          </Dialog>
        </Box>
      }
    </AuthPage>
  )
}
