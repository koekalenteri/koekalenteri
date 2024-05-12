import type { GridColDef } from '@mui/x-data-grid'
import type { BreedCode, Registration } from '../../types'

import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import CancelOutlined from '@mui/icons-material/CancelOutlined'
import EditOutlined from '@mui/icons-material/EditOutlined'
import EuroOutlined from '@mui/icons-material/EuroOutlined'
import PersonOutline from '@mui/icons-material/PersonOutline'
import Paper from '@mui/material/Paper'
import Typography from '@mui/material/Typography'
import { Box } from '@mui/system'
import { GridActionsCellItem } from '@mui/x-data-grid'

import { Path } from '../../routeConfig'
import StyledDataGrid from '../components/StyledDataGrid'

interface Props {
  readonly disabled?: boolean
  readonly rows: Registration[]
  readonly onUnregister: (registration: Registration) => void
}

export default function RegistrationList({ disabled, rows, onUnregister }: Props) {
  const { t } = useTranslation()
  const { t: breed } = useTranslation('breed')
  const navigate = useNavigate()

  const onEdit = (registration: Registration) => {
    navigate(`${Path.registration(registration)}/edit`)
  }

  const columns: GridColDef<Registration>[] = [
    {
      field: 'dog.name',
      valueGetter: (_value, row) => row.dog.name,
      headerName: t('dog.name'),
      renderCell: (params) => <strong>{params.value}</strong>,
      flex: 256,
    },
    {
      field: 'dog.regNo',
      valueGetter: (_value, row) => row.dog.regNo,
      headerName: t('dog.regNo'),
      flex: 128,
    },
    {
      field: 'dog.breedCode',
      valueGetter: (_value, row) => breed(row.dog.breedCode as BreedCode),
      headerName: t('dog.breed'),
      flex: 192,
    },
    {
      field: 'membership',
      headerName: t('registration.member'),
      headerAlign: 'center',
      align: 'center',
      valueGetter: (_value, row) => row.handler.membership || row.owner.membership,
      renderCell: (params) => (params.value ? <PersonOutline /> : ''),
    },
    {
      field: 'paymentStatus',
      headerName: t('registration.paid'),
      headerAlign: 'center',
      align: 'center',
      valueGetter: (_value, row) => !!row.paidAt,
      renderCell: (params) => (params.value ? <EuroOutlined /> : ''),
    },
    {
      field: 'actions',
      type: 'actions',
      getActions: (params: { row: Registration }) => {
        if (params.row.cancelled) {
          return [
            <Box key="cancelled" sx={{ color: 'warning.main', textTransform: 'uppercase' }}>
              {t('event.states.cancelled')}
            </Box>,
          ]
        }
        const always = [
          <GridActionsCellItem
            disabled={disabled}
            key="edit"
            color="info"
            icon={<EditOutlined />}
            label="Muokkaa ilmoittautumista"
            onClick={() => onEdit(params.row)}
          />,
          <GridActionsCellItem
            disabled={disabled}
            key="cancel"
            color="error"
            icon={<CancelOutlined />}
            label="Peru ilmoittautuminen"
            onClick={() => onUnregister(params.row)}
          />,
        ]
        if (params.row.paymentStatus !== 'SUCCESS' && params.row.paymentStatus !== 'PENDING') {
          return [
            <GridActionsCellItem
              disabled={disabled}
              key="pay"
              color="info"
              icon={<EuroOutlined />}
              label="Maksa ilmoittautuminen"
              onClick={() => navigate(Path.payment(params.row))}
            />,
            ...always,
          ]
        }
        return always
      },
    },
  ]

  return (
    <Paper sx={{ p: 1, mb: 1, width: '100%' }} elevation={2}>
      <Typography variant="h5">Ilmoitetut koirat</Typography>
      <Box sx={{ height: 120, '& .cancelled': { opacity: 0.5 } }}>
        <StyledDataGrid
          hideFooter={true}
          columns={columns}
          initialState={{ density: 'compact' }}
          disableRowSelectionOnClick
          rows={rows}
          getRowId={(row) => row.id}
          getRowClassName={(params) => (params.row.cancelled ? 'cancelled' : '')}
        />
      </Box>
    </Paper>
  )
}
