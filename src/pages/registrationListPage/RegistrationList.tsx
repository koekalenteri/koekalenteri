import type { Theme } from '@mui/material'
import type { GridColDef } from '@mui/x-data-grid'
import type { BreedCode, PublicDogEvent, Registration } from '../../types'
import CancelOutlined from '@mui/icons-material/CancelOutlined'
import EditOutlined from '@mui/icons-material/EditOutlined'
import EuroOutlined from '@mui/icons-material/EuroOutlined'
import { useMediaQuery } from '@mui/material'
import Typography from '@mui/material/Typography'
import { Box } from '@mui/system'
import { GridActionsCellItem } from '@mui/x-data-grid'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'
import { getPaymentStatus } from '../../lib/payment'
import { hasPriority } from '../../lib/registration'
import { Path } from '../../routeConfig'
import { IconsTooltip, TooltipIcon } from '../components/IconsTooltip'
import { PaymentIcon } from '../components/icons/PaymentIcon'
import { PriorityIcon } from '../components/icons/PriorityIcon'
import StyledDataGrid from '../components/StyledDataGrid'

type StrippedRegistration = Omit<Registration, 'grouo' | 'internalNotes'>

interface Props {
  readonly disabled?: boolean
  readonly event: PublicDogEvent
  readonly rows: StrippedRegistration[]
  readonly onUnregister: (registration: StrippedRegistration) => void
}

interface RegistrationListItemTooltipIconsProps {
  registration: StrippedRegistration
  priority: boolean | 0.5
}

const RegistrationListItemTooltipIcons = ({
  registration,
  priority,
  event,
}: RegistrationListItemTooltipIconsProps & { event: PublicDogEvent }) => {
  const { t } = useTranslation()
  return (
    <>
      <TooltipIcon
        key="priority"
        text={priority ? t('registration.priority.hasPriority') : t('registration.priority.noPriority')}
        icon={<PriorityIcon dim priority={priority} fontSize="small" />}
      />
      <TooltipIcon
        key="payment"
        text={t(getPaymentStatus(registration, event))}
        icon={<PaymentIcon paymentStatus={registration.paymentStatus} fontSize="small" />}
      />
    </>
  )
}

const RegistrationListItemIcons = ({
  event,
  registration,
}: {
  event: PublicDogEvent
  registration: StrippedRegistration
}) => {
  const priority = hasPriority(event, registration)
  return (
    <IconsTooltip
      icons={<RegistrationListItemTooltipIcons registration={registration} priority={priority} event={event} />}
      placement="bottom-start"
    >
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

  const onEdit = (registration: StrippedRegistration) => {
    navigate(`${Path.registration(registration)}/edit`)
  }

  const allColumns: GridColDef<StrippedRegistration>[] = [
    {
      field: 'dog.name',
      flex: 1,
      headerName: t('dog.name'),
      renderCell: (params) => <strong>{params.value}</strong>,
      valueGetter: (_value, row) => row.dog.name,
    },
    {
      field: 'dog.regNo',
      headerName: t('dog.regNo'),
      type: sm ? 'custom' : 'string',
      valueGetter: (_value, row) => row.dog.regNo,
      width: 160,
    },
    {
      field: 'dog.breedCode',
      headerName: t('dog.breed'),
      type: sm ? 'custom' : 'string',
      valueGetter: (_value, row) => breed(row.dog.breedCode as BreedCode),
      width: 160,
    },
    {
      field: 'icons',
      headerName: '',
      renderCell: (params) => <RegistrationListItemIcons event={event} registration={params.row} />,
      width: 48,
    },
    {
      field: 'actions',
      getActions: (params: { row: StrippedRegistration }) => {
        if (params.row.cancelled) {
          return [
            <GridActionsCellItem
              key="cancelled"
              showInMenu
              closeMenuOnClick
              disabled
              label={t('event.states.cancelled')}
              sx={{ color: 'warning.main !important', cursor: 'default', textTransform: 'uppercase' }}
            />,
          ]
        }
        const always = [
          <GridActionsCellItem
            disabled={disabled}
            key="edit"
            color="info"
            icon={<EditOutlined />}
            label={t('registration.actions.edit')}
            onClick={() => onEdit(params.row)}
          />,
          <GridActionsCellItem
            disabled={disabled}
            key="cancel"
            color="error"
            icon={<CancelOutlined />}
            label={t('registration.actions.cancel')}
            onClick={() => onUnregister(params.row)}
          />,
        ]
        if (
          !params.row.cancelled &&
          params.row.paymentStatus !== 'SUCCESS' &&
          params.row.paymentStatus !== 'PENDING' &&
          (event.paymentTime === 'registration' || params.row.confirmed)
        ) {
          return [
            <GridActionsCellItem
              disabled={disabled}
              key="pay"
              color="info"
              icon={<EuroOutlined />}
              label={t('registration.actions.pay')}
              onClick={() => navigate(Path.payment(params.row))}
            />,
            ...always,
          ]
        }
        return always
      },
      type: 'actions',
      width: 116,
    },
  ]

  const columns = allColumns.filter((c) => c.type !== 'custom')

  return (
    <Box sx={{ mb: 1, p: { md: 1, xs: 0.5 }, width: '100%' }}>
      <Typography variant="h5">{t('registration.registeredDogs')}</Typography>
      <Box sx={{ '& .cancelled': { opacity: 0.75 }, height: 120, width: '100%' }}>
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
              px: { sm: 1, xs: 0.5 },
            },
          }}
        />
      </Box>
    </Box>
  )
}
