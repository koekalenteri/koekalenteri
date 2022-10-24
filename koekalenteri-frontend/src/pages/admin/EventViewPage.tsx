import { Box, Button, Dialog, DialogContent, DialogTitle, Divider, Grid, Paper, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { AuthPage } from './AuthPage';
import { useStores } from '../../stores';
import { useParams } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { CollapsibleSection, LinkButton, RegistrationForm, StyledDataGrid } from '../../components';
import { ADMIN_EVENTS } from '../../config';
import { getRegistrations, putRegistration } from '../../api/event';
import { BreedCode, ConfirmedEventEx, Registration } from 'koekalenteri-shared/model';
import { GridColDef, GridSelectionModel } from '@mui/x-data-grid';
import { AddCircleOutline, DeleteOutline, EditOutlined, EmailOutlined, EuroOutlined, FormatListBulleted, PersonOutline, ShuffleOutlined, TableChartOutlined } from '@mui/icons-material';
import { format } from 'date-fns';
import { FullPageFlex } from '../../layout';


export function EventViewPage() {
  const params = useParams();
  const { t } = useTranslation();
  const { t: breed } = useTranslation('breed');
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
      const loadedEvent = await privateStore.get(id, abort.signal);
      if (privateStore.selectedEvent?.id !== loadedEvent?.id) {
        privateStore.setSelectedEvent(loadedEvent);
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

  const entryColumns: GridColDef[] = [
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
      <FullPageFlex>
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
          <Button startIcon={<FormatListBulleted />} disabled>Näytä tiedot</Button>
          <Button startIcon={<TableChartOutlined />} disabled>Vie Exceliin</Button>
          <Button startIcon={<EmailOutlined />} disabled>Lähetä viesti</Button>
          <Button startIcon={<ShuffleOutlined />} disabled>Arvo kokeen osallistujat</Button>
          <Divider orientation='vertical'></Divider>
          <Button startIcon={<AddCircleOutline />} onClick={() => { setSelected(undefined); setOpen(true); }}>{t('create')}</Button>
          <Button startIcon={<EditOutlined />} disabled={!selected} onClick={() => setOpen(true)}>{t('edit')}</Button>
          <Button startIcon={<DeleteOutline />} disabled>{t('delete')}</Button>
        </Stack>
        <StyledDataGrid
          loading={loading}
          autoPageSize
          columns={entryColumns}
          density='compact'
          disableColumnMenu
          rows={registrations}
          onSelectionModelChange={(selectionModel: GridSelectionModel) => setSelected(registrations.find(r => r.id === selectionModel[0]))}
          selectionModel={selected ? [selected.id] : []}
          onRowDoubleClick={() => setOpen(true)}
        />
      </FullPageFlex>
      <Dialog
        fullWidth
        maxWidth='lg'
        open={open}
        onClose={() => setOpen(false)}
        aria-labelledby="reg-dialog-title"
        PaperProps={{
          sx: {
            m: 1,
            maxHeight: 'calc(100% - 16px)',
            width: 'calc(100% - 16px)',
            '& .MuiDialogTitle-root': {
              fontSize: '1rem'
            }
          }
        }}
      >
        <DialogTitle id="reg-dialog-title">{selected ? `${selected.dog.name} / ${selected.handler.name}` : t('create')}</DialogTitle>
        <DialogContent dividers sx={{height: '100%', p: 0 }}>
          <RegistrationForm event={event} registration={selected} onSave={onSave} onCancel={onCancel} />
        </DialogContent>
      </Dialog>
    </AuthPage>
  )
}

function Title({ event }: { event: ConfirmedEventEx }) {
  const { t } = useTranslation();
  const title = event.isEventOver
    ? t('event.states.confirmed_eventOver')
    : event.isEntryClosed
      ? t('event.states.confirmed_entryClosed')
      : t('event.states.confirmed_entryOpen');

  return (
    <Typography variant="h5">
      {event.eventType}, {t('daterange', { start: event.startDate, end: event.endDate })}, {event.location}
      <Box sx={{ display: 'inline-block', mx: 2, color: '#018786' }}>{title}</Box>
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
