import { useTranslation } from 'react-i18next'
import {
  DragIndicatorOutlined,
  EditOutlined,
  EuroOutlined,
  EventBusyOutlined,
  PersonOutline,
} from '@mui/icons-material'
import { GridActionsCellItem, GridColumns, GridValueGetterParams } from '@mui/x-data-grid'
import { BreedCode, Registration } from 'koekalenteri-shared/model'

import GroupColors from './GroupColors'

export function useClassEntrySelectionColumns(eventDates: Date[], openEditDialog?: (id: string) => void) {
  const { t } = useTranslation()

  const entryColumns: GridColumns<Registration> = [
    {
      cellClassName: 'nopad',
      field: 'dates',
      headerName: '',
      width: 56,
      minWidth: 56,
      renderCell: (p) => (
        <>
          <DragIndicatorOutlined />
          <GroupColors dates={eventDates} selected={p.row.dates} />
        </>
      ),
      sortable: false,
    },
    {
      align: 'right',
      cellClassName: 'nopad',
      field: 'number',
      headerAlign: 'right',
      headerClassName: 'nopad',
      headerName: '#',
      width: 20,
      minWidth: 20,
      sortable: false,
      valueGetter: (p) => (p.row.group?.number ? `${p.row.group.number}.` : ''),
    },
    {
      field: 'dog.name',
      headerName: t('dog.name'),
      width: 250,
      flex: 1,
      sortable: false,
      valueGetter: (p: GridValueGetterParams<string, Registration>) => p.row.dog.name,
    },
    {
      field: 'dog.regNo',
      headerName: t('dog.regNo'),
      width: 130,
      sortable: false,
      valueGetter: (p) => p.row.dog.regNo,
    },
    {
      field: 'dob.breed',
      headerName: t('dog.breed'),
      width: 150,
      sortable: false,
      valueGetter: (p: GridValueGetterParams<BreedCode, Registration>) =>
        p.row.dog?.breedCode && p.row.dog?.gender
          ? t(`${p.row.dog.breedCode}.${p.row.dog.gender}`, { ns: 'breedAbbr', defaultValue: p.row.dog.breedCode })
          : '',
    },
    {
      field: 'handler',
      headerName: t('registration.handler'),
      width: 150,
      flex: 1,
      sortable: false,
      valueGetter: (p) => p.row.handler.name,
    },
    {
      field: 'member',
      headerName: t('registration.member'),
      width: 60,
      align: 'center',
      renderCell: (p) => (p.row.handler.membership ? <PersonOutline fontSize="small" /> : <></>),
      sortable: false,
    },
    {
      field: 'paid',
      headerName: t('registration.paid'),
      width: 90,
      align: 'center',
      renderCell: () => <EuroOutlined fontSize="small" />,
      sortable: false,
    },
    {
      cellClassName: 'nopad',
      field: 'actions',
      type: 'actions',
      headerName: '',
      width: 30,
      minWidth: 30,
      sortable: false,
      getActions: (p) => [
        <GridActionsCellItem
          icon={<EditOutlined fontSize="small" />}
          label={t('edit')}
          onClick={() => openEditDialog?.(p.row.id)}
          showInMenu
        />,
        <GridActionsCellItem
          icon={<EventBusyOutlined fontSize="small" />}
          label={t('withdraw')}
          onClick={() => openEditDialog?.(p.row.id)}
          showInMenu
        />,
      ],
    },
  ]

  const participantColumns: GridColumns<Registration> = [...entryColumns]

  const cancelledColumns: GridColumns<Registration> = [
    ...participantColumns,
    {
      field: 'cancelReason',
      headerName: 'Perumisen syy',
      width: 90,
    },
  ]

  return { cancelledColumns, entryColumns, participantColumns }
}
