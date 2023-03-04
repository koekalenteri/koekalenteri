import { useTranslation } from 'react-i18next'
import { EuroOutlined, PersonOutline } from '@mui/icons-material'
import { GridColDef, GridValueGetterParams } from '@mui/x-data-grid'
import { BreedCode, Registration } from 'koekalenteri-shared/model'

import GroupColors from './GroupColors'

export function useClassEntrySelectionColumns(eventDates: Date[]) {
  const { t } = useTranslation()

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
      valueGetter: (p: GridValueGetterParams<string, Registration>) => p.row.dog.name,
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
      valueGetter: (p: GridValueGetterParams<BreedCode, Registration>) =>
        p.row.dog?.breedCode ? t(p.row.dog.breedCode, { ns: 'breed' }) : '',
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
      renderCell: () => <EuroOutlined fontSize="small" />,
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

  const cancelledColumns: GridColDef[] = [
    ...participantColumns,
    {
      field: 'cancelReason',
      headerName: 'Perumisen syy',
      width: 90,
    },
  ]

  return { cancelledColumns, entryColumns, participantColumns }
}
