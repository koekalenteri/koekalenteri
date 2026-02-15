import type { GridColDef } from '@mui/x-data-grid'
import type { ReactElement } from 'react'
import type { PublicDogEvent, Registration, RegistrationDate } from '../../../../types'
import DragIndicatorOutlined from '@mui/icons-material/DragIndicatorOutlined'
import EditOutlined from '@mui/icons-material/EditOutlined'
import EventBusyOutlined from '@mui/icons-material/EventBusyOutlined'
import CircularProgress from '@mui/material/CircularProgress'
import { GridActionsCellItem } from '@mui/x-data-grid'
import { useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { canRefund, isPredefinedReason } from '../../../../lib/registration'
import GroupColors from './GroupColors'
import RegistrationIcons from './RegistrationIcons'

export function useClassEntrySelectionColumns(
  available: RegistrationDate[],
  event: PublicDogEvent,
  openEditDialog?: (id: string) => void,
  cancelRegistration?: (id: string) => void,
  refundRegistration?: (id: string) => void
) {
  const { t } = useTranslation()

  const createColumnDefinitions = useCallback(() => {
    const columnConfigs: Array<Partial<GridColDef<Registration>> & { field: string }> = [
      {
        cellClassName: 'nopad',
        display: 'flex',
        field: 'dates',
        headerName: '',
        minWidth: 56,
        renderCell: (p) => (
          <>
            <DragIndicatorOutlined />
            <GroupColors available={available} selected={p.row.dates} />
          </>
        ),
        width: 56,
      },
      {
        align: 'right',
        cellClassName: 'nopad',
        field: 'number',
        headerAlign: 'right',
        headerClassName: 'nopad',
        headerName: '#',
        minWidth: 30,
        renderCell: (p) => {
          const n = p.row.group?.number
          if (!n) return ''
          if (Number.isInteger(n)) return `${n}`
          return <CircularProgress size={10} thickness={5} />
        },
        width: 30,
      },
      {
        field: 'dog.name',
        flex: 1,
        headerName: t('dog.name'),
        valueGetter: (_value, row) => row.dog.name,
        width: 250,
      },
      {
        field: 'dog.regNo',
        headerName: t('dog.regNo'),
        valueGetter: (_value, row) => row.dog.regNo,
        width: 130,
      },
      {
        field: 'dob.breed',
        headerName: t('dog.breed'),
        valueGetter: (_value, row) =>
          row.dog?.breedCode && row.dog?.gender
            ? t(`${row.dog.breedCode}.${row.dog.gender}`, { defaultValue: row.dog.breedCode, ns: 'breedAbbr' })
            : '',
        width: 150,
      },
      {
        field: 'handler',
        flex: 1,
        headerName: t('registration.handler'),
        valueGetter: (_value, row) => row.handler?.name,
        width: 150,
      },
      {
        field: 'lastEmail',
        flex: 1,
        headerName: 'Viesti',
        valueGetter: (_value, row) => row.lastEmail ?? '',
        width: 130,
      },
      {
        align: 'center',
        field: 'icons',
        headerName: '',
        renderCell: (p) => <RegistrationIcons event={event} reg={p.row} />,
        width: 220, // icons * 20 + 20 for padding
      },
      {
        cellClassName: 'nopad',
        field: 'actions',
        getActions: (p) =>
          [
            <GridActionsCellItem
              key="edit"
              icon={<EditOutlined fontSize="small" />}
              label={t('edit')}
              onClick={() => openEditDialog?.(p.row.id)}
              showInMenu
            />,
            p.row.cancelled ? null : (
              <GridActionsCellItem
                key="withdraw"
                icon={<EventBusyOutlined fontSize="small" />}
                label={t('withdraw')}
                onClick={() => cancelRegistration?.(p.row.id)}
                showInMenu
              />
            ),
            canRefund(p.row) ? (
              <GridActionsCellItem
                key="refund"
                icon={<EventBusyOutlined fontSize="small" />}
                label={t('refund')}
                onClick={() => refundRegistration?.(p.row.id)}
                showInMenu
                disabled={(p.row.refundAmount ?? 0) === (p.row.paidAmount ?? 0)}
              />
            ) : null,
          ].filter((a): a is ReactElement => a !== null),
        headerName: '',
        minWidth: 30,
        type: 'actions',
        width: 30,
      },
    ]

    // Apply common properties to all columns
    return columnConfigs.map((config) => ({
      ...config,
      sortable: false, // Common property for all columns
    })) as GridColDef<Registration>[]
  }, [available, cancelRegistration, event, openEditDialog, refundRegistration, t])

  return useMemo(() => {
    const entryColumns = createColumnDefinitions()

    const participantColumns = [...entryColumns]

    const cancelledColumns = [...participantColumns]
    cancelledColumns.splice(-2, 0, {
      field: 'cancelReason',
      headerName: 'Perumisen syy',
      sortable: false,
      valueFormatter: (v: string) => (isPredefinedReason(v) ? t(`registration.cancelReason.${v}`) : v),
      width: 144,
    })

    return { cancelledColumns, entryColumns, participantColumns }
  }, [t, createColumnDefinitions])
}
