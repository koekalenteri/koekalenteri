import type { GridColDef } from '@mui/x-data-grid'
import type { ReactElement } from 'react'
import type { PublicDogEvent, Registration, RegistrationDate } from '../../../../types'

import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import DragIndicatorOutlined from '@mui/icons-material/DragIndicatorOutlined'
import EditOutlined from '@mui/icons-material/EditOutlined'
import EmailOutlined from '@mui/icons-material/EmailOutlined'
import EventBusyOutlined from '@mui/icons-material/EventBusyOutlined'
import LowPriorityOutlined from '@mui/icons-material/LowPriorityOutlined'
import SwapHorizOutlined from '@mui/icons-material/SwapHorizOutlined'
import CircularProgress from '@mui/material/CircularProgress'
import { GridActionsCellItem } from '@mui/x-data-grid'

import {
  canRefund,
  getRegistrationGroupKey,
  GROUP_KEY_CANCELLED,
  GROUP_KEY_RESERVE,
  isPredefinedReason,
} from '../../../../lib/registration'

import GroupColors from './GroupColors'
import RegistrationIcons from './RegistrationIcons'

interface RegistrationActionCallbacks {
  openEditDialog?: (id: string) => void
  cancelRegistration?: (id: string) => void
  refundRegistration?: (id: string) => void
  moveToGroup?: (id: string) => void
  moveToPosition?: (id: string) => void
  moveToReserve?: (id: string) => void
  moveToParticipants?: (id: string) => void
  sendMessage?: (id: string) => void
}

export function useClassEntrySelectionColumns(
  available: RegistrationDate[],
  event: PublicDogEvent,
  callbacks?: RegistrationActionCallbacks
) {
  const { t } = useTranslation()

  const createColumnDefinitions = () => {
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
        valueGetter: (_value, row) => row.handler?.name,
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
        width: 220, // icons * 20 + 20 for padding
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
        getActions: (p) => {
          const groupKey = getRegistrationGroupKey(p.row)
          const isParticipant = groupKey !== GROUP_KEY_RESERVE && groupKey !== GROUP_KEY_CANCELLED
          const isReserve = groupKey === GROUP_KEY_RESERVE
          const isCancelled = groupKey === GROUP_KEY_CANCELLED
          const hasGroups = available.length > 1

          const actions: ReactElement[] = []

          // Movement actions for participants
          if (isParticipant) {
            if (hasGroups) {
              actions.push(
                <GridActionsCellItem
                  key="moveToGroup"
                  icon={<SwapHorizOutlined fontSize="small" />}
                  label={t('registration.actions.moveToGroup')}
                  onClick={() => callbacks?.moveToGroup?.(p.row.id)}
                  showInMenu
                />
              )
            }
            actions.push(
              <GridActionsCellItem
                key="moveToPosition"
                icon={<LowPriorityOutlined fontSize="small" />}
                label={t('registration.actions.moveToPosition')}
                onClick={() => callbacks?.moveToPosition?.(p.row.id)}
                showInMenu
              />
            )
            actions.push(
              <GridActionsCellItem
                key="moveToReserve"
                icon={<LowPriorityOutlined fontSize="small" />}
                label={t('registration.actions.moveToReserve')}
                onClick={() => callbacks?.moveToReserve?.(p.row.id)}
                showInMenu
              />
            )
            actions.push(
              <GridActionsCellItem
                key="moveBackToRegistered"
                icon={<LowPriorityOutlined fontSize="small" />}
                label={t('registration.actions.moveBackToRegistered')}
                onClick={() => callbacks?.moveToReserve?.(p.row.id)}
                showInMenu
              />
            )
          }

          // Movement actions for reserve
          if (isReserve) {
            // "Siirrä osallistujiin" - moves to end of participants
            actions.push(
              <GridActionsCellItem
                key="moveToParticipants"
                icon={<SwapHorizOutlined fontSize="small" />}
                label={t('registration.actions.moveToParticipants')}
                onClick={() => callbacks?.moveToParticipants?.(p.row.id)}
                showInMenu
              />
            )
            // "Siirrä tietylle starttipaikalle" - moves from reserve to participants at specific position
            actions.push(
              <GridActionsCellItem
                key="moveToPosition"
                icon={<LowPriorityOutlined fontSize="small" />}
                label={t('registration.actions.moveToPosition')}
                onClick={() => callbacks?.moveToPosition?.(p.row.id)}
                showInMenu
              />
            )
          }

          // Movement actions for cancelled
          if (isCancelled) {
            actions.push(
              <GridActionsCellItem
                key="moveToReserve"
                icon={<LowPriorityOutlined fontSize="small" />}
                label={t('registration.actions.moveToReserve')}
                onClick={() => callbacks?.moveToReserve?.(p.row.id)}
                showInMenu
              />
            )
          }

          // Refund action (available for all states if payment can be refunded)
          if (canRefund(p.row) && (p.row.refundAmount ?? 0) < (p.row.paidAmount ?? 0)) {
            actions.push(
              <GridActionsCellItem
                key="refund"
                icon={<EventBusyOutlined fontSize="small" />}
                label={t('registration.actions.refundPayment')}
                onClick={() => callbacks?.refundRegistration?.(p.row.id)}
                showInMenu
              />
            )
          }

          // Common actions
          actions.push(
            <GridActionsCellItem
              key="edit"
              icon={<EditOutlined fontSize="small" />}
              label={t('registration.actions.edit')}
              onClick={() => callbacks?.openEditDialog?.(p.row.id)}
              showInMenu
            />
          )

          if (!isCancelled) {
            actions.push(
              <GridActionsCellItem
                key="cancel"
                icon={<EventBusyOutlined fontSize="small" />}
                label={t('registration.actions.cancel')}
                onClick={() => callbacks?.cancelRegistration?.(p.row.id)}
                showInMenu
              />
            )
          }

          actions.push(
            <GridActionsCellItem
              key="sendMessage"
              icon={<EmailOutlined fontSize="small" />}
              label={t('registration.actions.sendMessage')}
              onClick={() => callbacks?.sendMessage?.(p.row.id)}
              showInMenu
            />
          )

          return actions
        },
      },
    ]

    // Apply common properties to all columns
    return columnConfigs.map((config) => ({
      ...config,
      sortable: false, // Common property for all columns
    })) as GridColDef<Registration>[]
  }

  return useMemo(() => {
    const entryColumns = createColumnDefinitions()

    const participantColumns = [...entryColumns]

    const cancelledColumns = [...participantColumns]
    cancelledColumns.splice(-2, 0, {
      field: 'cancelReason',
      headerName: 'Perumisen syy',
      width: 144,
      sortable: false,
      valueFormatter: (v: string) => (isPredefinedReason(v) ? t(`registration.cancelReason.${v}`) : v),
    })

    return { cancelledColumns, entryColumns, participantColumns }
  }, [available, callbacks, event, t])
}
