import type { GridColDef } from '@mui/x-data-grid'
import type { ReactElement } from 'react'
import type { PublicDogEvent, Registration, RegistrationDate } from '../../../../types'

import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import DragIndicatorOutlined from '@mui/icons-material/DragIndicatorOutlined'
import EditOutlined from '@mui/icons-material/EditOutlined'
import EventBusyOutlined from '@mui/icons-material/EventBusyOutlined'
import CircularProgress from '@mui/material/CircularProgress'
import { GridActionsCellItem } from '@mui/x-data-grid'

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

  // Helper function to create common column definitions
  const createColumnDefinitions = () => {
    // Define column configurations with common properties
    const columnConfigs: Array<Partial<GridColDef<Registration>> & { field: string }> = [
      {
        cellClassName: 'nopad',
        field: 'dates',
        headerName: '',
        width: 56,
        minWidth: 56,
        display: 'flex',
        renderCell: (p) => (
          <>
            <DragIndicatorOutlined />
            <GroupColors available={available} selected={p.row.dates} />
          </>
        ),
      },
      {
        align: 'right',
        cellClassName: 'nopad',
        field: 'number',
        headerAlign: 'right',
        headerClassName: 'nopad',
        headerName: '#',
        width: 30,
        minWidth: 30,
        renderCell: (p) => {
          const n = p.row.group?.number
          if (!n) return ''
          if (Number.isInteger(n)) return `${n}`
          return <CircularProgress size={10} thickness={5} />
        },
      },
      {
        field: 'dog.name',
        headerName: t('dog.name'),
        width: 250,
        flex: 1,
        valueGetter: (_value, row) => row.dog.name,
      },
      {
        field: 'dog.regNo',
        headerName: t('dog.regNo'),
        width: 130,
        valueGetter: (_value, row) => row.dog.regNo,
        cellClassName: 'copyable-cell',
        renderCell: (params) => (
          <div
            aria-label={`${t('dog.regNo')}: ${params.value}, Click to copy`}
            role="button"
            tabIndex={0}
            style={{ cursor: 'pointer', width: '100%' }}
          >
            {params.value}
          </div>
        ),
      },
      {
        field: 'dob.breed',
        headerName: t('dog.breed'),
        width: 150,
        valueGetter: (_value, row) =>
          row.dog?.breedCode && row.dog?.gender
            ? t(`${row.dog.breedCode}.${row.dog.gender}`, { ns: 'breedAbbr', defaultValue: row.dog.breedCode })
            : '',
      },
      {
        field: 'handler',
        headerName: t('registration.handler'),
        width: 150,
        flex: 1,
        valueGetter: (_value, row) => row.handler.name,
      },
      {
        field: 'lastEmail',
        headerName: 'Viesti',
        width: 130,
        flex: 1,
        valueGetter: (_value, row) => row.lastEmail ?? '',
      },
      {
        field: 'icons',
        headerName: '',
        width: 200, // icons * 20 + 20 for padding
        align: 'center',
        renderCell: (p) => <RegistrationIcons event={event} reg={p.row} />,
      },
      {
        cellClassName: 'nopad',
        field: 'actions',
        type: 'actions',
        headerName: '',
        width: 30,
        minWidth: 30,
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
      },
    ]

    // Apply common properties to all columns
    return columnConfigs.map((config) => ({
      ...config,
      sortable: false, // Common property for all columns
    })) as GridColDef<Registration>[]
  }

  return useMemo(() => {
    // Create base columns with common configuration
    const entryColumns = createColumnDefinitions()

    // Create participant columns (same as entry columns for now)
    const participantColumns = [...entryColumns]

    // Create cancelled columns with an additional column
    const cancelledColumns = [...participantColumns]
    cancelledColumns.splice(cancelledColumns.length - 2, 0, {
      field: 'cancelReason',
      headerName: 'Perumisen syy',
      width: 144,
      sortable: false,
      valueFormatter: (v: string) => (isPredefinedReason(v) ? t(`registration.cancelReason.${v}`) : v),
    })

    return { cancelledColumns, entryColumns, participantColumns }
  }, [available, cancelRegistration, event, openEditDialog, refundRegistration, t])
}
