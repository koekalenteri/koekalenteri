import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { CancelOutlined, EditOutlined, EuroOutlined, PersonOutline } from '@mui/icons-material'
import { Paper, Typography } from '@mui/material'
import { Box } from '@mui/system'
import { GridActionsCellItem, GridColumns } from '@mui/x-data-grid'
import { BreedCode, Registration } from 'koekalenteri-shared/model'

import StyledDataGrid from '../components/StyledDataGrid'

export default function RegistrationList({
  rows,
  onUnregister,
}: {
  rows: Registration[]
  onUnregister: (registration: Registration) => void
}) {
  const { t } = useTranslation()
  const { t: breed } = useTranslation('breed')
  const navigate = useNavigate()

  const onEdit = (registration: Registration) => {
    navigate(`/registration/${registration.eventType}/${registration.eventId}/${registration.id}/edit`)
  }

  const columns: GridColumns<Registration> = [
    {
      field: 'dog.name',
      valueGetter: (params) => params.row.dog.name,
      headerName: t('dog.name'),
      renderCell: (params) => <strong>{params.value}</strong>,
      flex: 256,
    },
    {
      field: 'dog.regNo',
      valueGetter: (params) => params.row.dog.regNo,
      headerName: t('dog.regNo'),
      flex: 128,
    },
    {
      field: 'dog.breedCode',
      valueGetter: (params) => breed(params.row.dog.breedCode as BreedCode),
      headerName: t('dog.breed'),
      flex: 192,
    },
    {
      field: 'handler.membership',
      headerName: t('registration.member'),
      headerAlign: 'center',
      align: 'center',
      valueGetter: (params) => params.row.handler.membership,
      renderCell: (params) => (params.value ? <PersonOutline /> : ''),
    },
    {
      field: 'paymentStatus',
      headerName: t('registration.paid'),
      headerAlign: 'center',
      align: 'center',
      valueGetter: (params) => !!params.row.paidAt,
      renderCell: (params) => (params.value ? <EuroOutlined /> : ''),
    },
    {
      field: 'actions',
      type: 'actions',
      getActions: (params) =>
        params.row.cancelled
          ? [
              <Box key="cancelled" sx={{ color: 'warning.main', textTransform: 'uppercase' }}>
                {t('event.states.cancelled')}
              </Box>,
            ]
          : [
              <GridActionsCellItem
                key="edit"
                color="info"
                icon={<EditOutlined />}
                label="Muokkaa ilmoittautumista"
                onClick={() => onEdit(params.row)}
              />,
              <GridActionsCellItem
                key="cancel"
                color="error"
                icon={<CancelOutlined />}
                label="Peru ilmoittautuminen"
                onClick={() => onUnregister(params.row)}
              />,
            ],
    },
  ]

  return (
    <Paper sx={{ p: 1, mb: 1, width: '100%' }} elevation={2}>
      <Typography variant="h5">Ilmoitetut koirat</Typography>
      <Box sx={{ height: 120, '& .cancelled': { opacity: 0.5 } }}>
        <StyledDataGrid
          hideFooter={true}
          columns={columns}
          density="compact"
          disableSelectionOnClick
          rows={rows}
          getRowId={(row) => row.id}
          getRowClassName={(params) => (params.row.cancelled ? 'cancelled' : '')}
        />
      </Box>
    </Paper>
  )
}
