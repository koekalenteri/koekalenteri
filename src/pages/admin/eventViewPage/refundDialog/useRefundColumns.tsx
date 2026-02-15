import type { GridColDef } from '@mui/x-data-grid'
import type { Transaction } from '../../../../types'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { formatDate } from '../../../../i18n/dates'
import { formatMoney } from '../../../../lib/money'
import { getProviderName } from '../../../../lib/payment'

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
      {
        field: 'createdAt',
        headerName: t('registration.refundDialog.columns.statusAt'),
        valueFormatter: (value) => formatDate(value, 'dd.MM.yy HH:mm:ss'),
        width: 140,
      },
      {
        field: 'provider',
        flex: 1,
        headerName: t('registration.refundDialog.columns.provider'),
        valueFormatter: getProviderName,
      },
      { field: 'status', headerName: t('registration.refundDialog.columns.status'), width: 60 },
      { field: 'bankReference', headerName: t('registration.refundDialog.columns.bankReference'), width: 120 },
      {
        field: 'type',
        headerName: t('registration.refundDialog.columns.type'),
        valueFormatter: (value) => (value === 'payment' ? 'Maksu' : 'Palautus'),
        width: 80,
      },
      {
        align: 'right',
        field: 'amount',
        headerName: t('registration.refundDialog.columns.amount'),
        valueGetter: (value, row) => {
          if (row.status !== 'ok') return ''

          const divider = row.type === 'refund' ? -100 : 100

          return formatMoney(value / divider)
        },
        width: 100,
      },
    ],
    [t]
  )
}
