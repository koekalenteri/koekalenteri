import { useTranslation } from "react-i18next"
import { useNavigate } from "react-router-dom"
import { CancelOutlined, EditOutlined, EuroOutlined, PersonOutline } from "@mui/icons-material"
import { Paper, Typography } from "@mui/material"
import { Box } from "@mui/system"
import { GridActionsCellItem, GridColDef, GridRowParams } from "@mui/x-data-grid"
import { BreedCode, Registration } from "koekalenteri-shared/model"

import StyledDataGrid from "../components/StyledDataGrid"

type Join<K, P> = K extends string | number ?
  P extends string | number ?
  `${K}${"" extends P ? "" : "."}${P}`
    : never : never;

type Prev = [never, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
  11, 12, 13, 14, 15, 16, 17, 18, 19, 20, ...0[]]

type Leaves<T, D extends number = 10> = [D] extends [never] ? never : T extends object ?
  { [K in keyof T]-?: Join<K, Leaves<T[K], Prev[D]>> }[keyof T] : "";

interface RegistrationListColDef extends GridColDef {
  field: Leaves<Registration> | 'actions'
  getActions?: (params: GridRowParams<Registration>) => JSX.Element[]
}

export default function RegistrationList({rows, onUnregister}: {rows: Registration[], onUnregister: (registration: Registration) => void}) {
  const { t } = useTranslation()
  const { t: breed } = useTranslation('breed')
  const navigate = useNavigate()

  const onEdit = (registration: Registration) => {
    navigate(`/registration/${registration.eventType}/${registration.eventId}/${registration.id}/edit`)
  }

  const columns: RegistrationListColDef[] = [
    {
      field: 'dog.name',
      valueGetter: (params) =>  params.row.dog.name,
      headerName: t('dog.name'),
      renderCell: (params) => <strong>{params.value}</strong>,
      flex: 256,
    },
    {
      field: 'dog.regNo',
      valueGetter: (params) =>  params.row.dog.regNo,
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
      renderCell: (params) => params.value ? <PersonOutline /> : '',
    },
    {
      field: 'paid',
      headerName: t('registration.paid'),
      headerAlign: 'center',
      align: 'center',
      valueGetter: (params) => params.row.paid,
      renderCell: (params) => params.value ? <EuroOutlined /> : '',
    },
    {
      field: 'actions',
      type: 'actions',
      getActions: (params) => params.row.cancelled ? [
        <Box sx={{ color: 'warning.main', textTransform: 'uppercase' }}>{t('event.states.cancelled')}</Box>,
      ] : [
        <GridActionsCellItem color="info" icon={<EditOutlined />} label="Muokkaa ilmoittautumista" onClick={() => onEdit(params.row)} showInMenu={false} onResize={undefined} onResizeCapture={undefined} />,
        <GridActionsCellItem color="error" icon={<CancelOutlined />} label="Peru ilmoittautuminen" onClick={() => onUnregister(params.row)} showInMenu={false} onResize={undefined} onResizeCapture={undefined} />,
      ],
    },
  ]

  return (
    <Paper sx={{ p: 1, mb: 1, width: '100%' }} elevation={2}>
      <Typography variant="h5">Ilmoitetut koirat</Typography>
      <Box sx={{height: 120, '& .cancelled': {opacity: 0.5}}}>
        <StyledDataGrid
          hideFooter={true}
          columns={columns}
          density='compact'
          disableSelectionOnClick
          rows={rows}
          getRowId={(row) => row.id}
          getRowClassName={(params) => params.row.cancelled ? 'cancelled' : ''}
        />
      </Box>
    </Paper>
  )
}
