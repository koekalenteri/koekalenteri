import type { Theme } from '@mui/material'
import type { GridColDef } from '@mui/x-data-grid'
import type { BreedCode, PublicDogEvent, Registration } from '../../types'
import type { TooltipContent } from '../components/IconsTooltip'

import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'
import CancelOutlined from '@mui/icons-material/CancelOutlined'
import EditOutlined from '@mui/icons-material/EditOutlined'
import EuroOutlined from '@mui/icons-material/EuroOutlined'
import { useMediaQuery } from '@mui/material'
import Typography from '@mui/material/Typography'
import { Box } from '@mui/system'
import { GridActionsCellItem } from '@mui/x-data-grid'

import { getPaymentStatus } from '../../lib/payment'
import { hasPriority } from '../../lib/registration'
import { Path } from '../../routeConfig'
import { PaymentIcon } from '../components/icons/PaymentIcon'
import { PriorityIcon } from '../components/icons/PriorityIcon'
import { IconsTooltip } from '../components/IconsTooltip'
import StyledDataGrid from '../components/StyledDataGrid'

interface Props {
  readonly disabled?: boolean
  readonly event: PublicDogEvent
  readonly rows: Registration[]
  readonly onUnregister: (registration: Registration) => void
}

const Icons = ({ event, registration }: { event: PublicDogEvent; registration: Registration }) => {
  const { t } = useTranslation()
  const priority = hasPriority(event, registration)
  const items: TooltipContent[] = [
    {
      text: priority ? 'Olen etusijalla' : 'En ole etusijalla',
      icon: <PriorityIcon dim priority={priority} fontSize="small" />,
    },
    {
      text: t(getPaymentStatus(registration)),
      icon: <PaymentIcon paymentStatus={registration.paymentStatus} fontSize="small" />,
    },
  ]
  return (
    <IconsTooltip items={items} placement="bottom-start">
      <Box height="28px" display="flex" alignItems="center">
        <PriorityIcon dim priority={priority} fontSize="small" />
        <PaymentIcon dim paymentStatus={registration.paymentStatus} fontSize="small" />
      </Box>
    </IconsTooltip>
  )
}

export default function RegistrationList({ event, disabled, rows, onUnregister }: Props) {
  const { t } = useTranslation()
  const { t: breed } = useTranslation('breed')
  const sm = useMediaQuery((theme: Theme) => theme.breakpoints.down('sm'))
  const navigate = useNavigate()

  const onEdit = (registration: Registration) => {
    navigate(`${Path.registration(registration)}/edit`)
  }

  const allColumns: GridColDef<Registration>[] = [
    {
      field: 'dog.name',
      valueGetter: (_value, row) => row.dog.name,
      headerName: t('dog.name'),
      renderCell: (params) => <strong>{params.value}</strong>,
      flex: 1,
    },
    {
      type: sm ? 'custom' : 'string',
      field: 'dog.regNo',
      valueGetter: (_value, row) => row.dog.regNo,
      headerName: t('dog.regNo'),
      width: 160,
    },
    {
      type: sm ? 'custom' : 'string',
      field: 'dog.breedCode',
      valueGetter: (_value, row) => breed(row.dog.breedCode as BreedCode),
      headerName: t('dog.breed'),
      width: 160,
    },
    {
      field: 'icons',
      width: 48,
      headerName: '',
      renderCell: (params) => <Icons event={event} registration={params.row} />,
    },
    {
      field: 'actions',
      type: 'actions',
      width: 116,
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

  const columns = allColumns.filter((c) => c.type !== 'custom')

  return (
    <Box sx={{ p: { xs: 0.5, md: 1 }, mb: 1, width: '100%' }}>
      <Typography variant="h5">Ilmoitetut koirat</Typography>
      <Box sx={{ height: 120, '& .cancelled': { opacity: 0.75 }, width: '100%' }}>
        <StyledDataGrid
          hideFooter={true}
          columns={columns}
          initialState={{ density: 'compact' }}
          disableRowSelectionOnClick
          rows={rows}
          getRowId={(row) => row.id}
          getRowClassName={(params) => (params.row.cancelled ? 'cancelled' : '')}
          sx={{
            '& .MuiDataGrid-cell': {
              px: { xs: 0.5, sm: 1 },
            },
          }}
        />
      </Box>
    </Box>
  )
}
