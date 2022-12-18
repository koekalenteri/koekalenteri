import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AddCircleOutline, DeleteOutline, EditOutlined, EmailOutlined, EuroOutlined, FormatListBulleted, PersonOutline, ShuffleOutlined, TableChartOutlined } from '@mui/icons-material'
import { Box, Button, Dialog, DialogContent, DialogTitle, Divider, Grid, Stack, Typography } from '@mui/material'
import { GridColDef, GridSelectionModel } from '@mui/x-data-grid'
import { BreedCode, ConfirmedEventEx, Registration } from 'koekalenteri-shared/model'
import { toJS } from 'mobx'
import { observer } from 'mobx-react-lite'

import { putRegistration } from '../../api/event'
import { CollapsibleSection, LinkButton, RegistrationForm, StyledDataGrid } from '../../components'
import { Path } from '../../routeConfig'
import { useStores } from '../../stores'
import { uniqueDate } from '../../utils'

import FullPageFlex from './components/FullPageFlex'
import GroupColors, { availableGroups } from './eventViewPage/GroupColors'
import GroupHeader from './eventViewPage/GroupHeader'
import InfoPanel from './eventViewPage/InfoPanel'
import NoRowsOverlay from './eventViewPage/NoRowsOverlay'
import Title from './eventViewPage/Title'

export const EventViewPageWithData = observer(function EventViewPageWithData() {
  const { privateStore } = useStores()

  if (!privateStore.selectedEvent) {
    return null
  }

  return (
    <EventViewPage
      event={toJS(privateStore.selectedEvent) as ConfirmedEventEx}
      registrations={toJS(privateStore.selectedEventRegistrations)}
      loading={toJS(privateStore.loading)}
    />
  )
})

interface Props {
  event: ConfirmedEventEx
  registrations: Registration[]
  loading: boolean
}

export const EventViewPage = ({event, registrations, loading}: Props) => {
  const { t } = useTranslation()
  const { t: breed } = useTranslation('breed')
  const [open, setOpen] = useState(false)
  const [list, setList] = useState(registrations)
  const [selected, setSelected] = useState<Registration>()

  const eventDates = useMemo(() => uniqueDate(event.classes?.map(c => c.date || event.startDate)), [event])
  const eventGroups = useMemo(() => availableGroups(eventDates), [eventDates])

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

  const onSave = async (registration: Registration) => {
    try {
      const saved = await putRegistration(registration)
      const old = list.find(r => r.id === saved.id)
      if (old) {
        Object.assign(old, saved)
        setSelected(saved)
      } else {
        setList(list.concat([saved]))
        event.entries++
      }
      // TODO: update event calsses (infopanel)
      setOpen(false)
      return true
    } catch (e: any) {
      console.error(e)
      return false
    }
  }
  const onCancel = async () => {
    setOpen(false)
    return true
  }

  return (
    <>
      <FullPageFlex>
        <Grid container justifyContent="space-between">
          <Grid item xs>
            <LinkButton sx={{ mb: 1 }} to={Path.admin.events} text={t('goBack')} />
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
          <Button startIcon={<AddCircleOutline />} onClick={() => { setSelected(undefined); setOpen(true) }}>{t('create')}</Button>
          <Button startIcon={<EditOutlined />} disabled={!selected} onClick={() => setOpen(true)}>{t('edit')}</Button>
          <Button startIcon={<DeleteOutline />} disabled>{t('delete')}</Button>
        </Stack>
        {event.isEntryClosed &&
        <>
          <Typography variant='h5'>Osallistujat</Typography>
          <Box sx={{height: 40, width: '100%', overflow: 'hidden'}}>
            <StyledDataGrid
              columns={participantColumns}
              density='compact'
              disableColumnMenu
              disableVirtualization
              hideFooter
              rows={[]}
              components={{
                NoRowsOverlay: () => null,
              }}
            />
          </Box>
          {eventGroups.map((group, index) =>
            <StyledDataGrid
              key={group.date.toDateString() + group.time}
              loading={loading}
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
            />,
          )}
        </>
        }
        <Typography variant='h5'>Ilmoittautuneet</Typography>
        <StyledDataGrid
          loading={loading}
          columns={entryColumns}
          density='compact'
          disableColumnMenu
          rows={list}
          onSelectionModelChange={(selectionModel: GridSelectionModel) => setSelected(list.find(r => r.id === selectionModel[0]))}
          selectionModel={selected ? [selected.id] : []}
          onRowDoubleClick={() => setOpen(true)}
          sx={{flex: eventGroups.length || 1}}
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
              fontSize: '1rem',
            },
          },
        }}
      >
        <DialogTitle id="reg-dialog-title">{selected ? `${selected.dog.name} / ${selected.handler.name}` : t('create')}</DialogTitle>
        <DialogContent dividers sx={{height: '100%', p: 0 }}>
          <RegistrationForm event={event} registration={selected} onSave={onSave} onCancel={onCancel} />
        </DialogContent>
      </Dialog>
    </>
  )

}
