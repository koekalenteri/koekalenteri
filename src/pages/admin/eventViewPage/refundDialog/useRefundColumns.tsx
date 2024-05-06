import type { GridColDef } from '@mui/x-data-grid'
import type { Transaction } from '../../../../types'

import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { formatDate } from '../../../../i18n/dates'
import { formatMoney } from '../../../../lib/money'

/*
"bankReference": "7062825129",
"status": "ok",
"statusAt": "2024-04-07T09:43:48.857Z",
"createdAt": "2024-04-07T09:43:42.823Z",
"amount": 100,
"provider": "nordea",
"stamp": "3JTgKQg60_6_TXboRAgVY",
"transactionId": "520fd8c2-f4c3-11ee-a323-d325ebd1b830",
"reference": "L5qGrAvfcD:qGhvZdDYqF",
"type": "payment"
*/

export const useRefundColumns = (): readonly GridColDef<Transaction>[] => {
  const { t } = useTranslation()

  return useMemo<GridColDef<Transaction>[]>(
    () => [
      { field: 'provider', width: 100, headerName: t('registration.refundDialog.columns.provider') },
      { field: 'status', width: 60, headerName: t('registration.refundDialog.columns.status') },
      { field: 'bankReference', flex: 3, headerName: t('registration.refundDialog.columns.bankReference') },
      // { field: 'reference', flex: 5, headerName: t('registration.refundDialog.columns.reference') },
      { field: 'type', width: 80, headerName: t('registration.refundDialog.columns.type') },
      {
        field: 'statusAt',
        valueFormatter: (value) => formatDate(value, 'dd.MM.yy HH:mm'),
        width: 120,
        headerName: t('registration.refundDialog.columns.statusAt'),
      },
      {
        field: 'amount',
        valueGetter: (value, row) =>
          row.status === 'ok' ? formatMoney(value / (row.type === 'refund' ? -100 : 100)) : '',
        width: 100,
        headerName: t('registration.refundDialog.columns.amount'),
      },
    ],
    [t]
  )
}
