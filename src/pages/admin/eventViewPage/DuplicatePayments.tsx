import type { DuplicatePaymentEntry, MinimalEventForCost, PublicDogEvent } from '@/types'
import Alert from '@mui/material/Alert'
import AlertTitle from '@mui/material/AlertTitle'
import Button from '@mui/material/Button'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import Typography from '@mui/material/Typography'
import { useAtomValue } from 'jotai'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { formatMoney } from '@/lib/money'
import { adminDuplicatePaymentsAtom } from '../state'
import { RefundDailog } from './RefundDialog'

interface Props {
  readonly event: PublicDogEvent & MinimalEventForCost
}

interface RowProps {
  readonly entry: DuplicatePaymentEntry
  readonly onRefund: (id: string) => void
}

const DuplicatePaymentRow = ({ entry: { amount, duplicatePaymentAt, registration }, onRefund }: RowProps) => {
  const { t } = useTranslation()
  // A refund on its way settles by itself; RefundCreate would refuse a second one meanwhile.
  const refundOpen = (registration.openRefunds?.length ?? 0) > 0

  return (
    <TableRow>
      <TableCell>
        {registration.dog.name} ({registration.dog.regNo})
      </TableCell>
      <TableCell>{registration.payer?.name}</TableCell>
      <TableCell align="right">{formatMoney(amount)}</TableCell>
      <TableCell>{t('dateFormat.long', { date: duplicatePaymentAt })}</TableCell>
      <TableCell align="right">
        {refundOpen ? (
          <Typography variant="body2">{t('registration.duplicatePayments.refundPending')}</Typography>
        ) : (
          <Button color="inherit" onClick={() => onRefund(registration.id)} size="small" variant="outlined">
            {t('refund')}
          </Button>
        )}
      </TableCell>
    </TableRow>
  )
}

/**
 * The event's payments charged twice that have not gone back (KOE-1693): shown only when there are
 * any, and on their own, since such a row is on no class list, group or counter. The money went past
 * a check of this app, so finding them here is all the secretary needs to give it back.
 */
export default function DuplicatePayments({ event }: Props) {
  const { t } = useTranslation()
  const entries = useAtomValue(adminDuplicatePaymentsAtom(event.id))
  const [selectedId, setSelectedId] = useState<string>()
  const selected = entries.find((entry) => entry.registration.id === selectedId)

  if (entries.length === 0) return null

  return (
    <Alert severity="warning" sx={{ '& .MuiAlert-message': { width: '100%' }, m: 1 }}>
      <AlertTitle>{t('registration.duplicatePayments.title')}</AlertTitle>
      {t('registration.duplicatePayments.text')}
      <Table size="small" sx={{ '& .MuiTableCell-root': { borderColor: 'divider', color: 'inherit' }, mt: 1 }}>
        <TableHead>
          <TableRow>
            <TableCell>{t('registration.duplicatePayments.dog')}</TableCell>
            <TableCell>{t('registration.duplicatePayments.payer')}</TableCell>
            <TableCell align="right">{t('registration.duplicatePayments.amount')}</TableCell>
            <TableCell>{t('registration.duplicatePayments.date')}</TableCell>
            <TableCell align="right">{t('registration.duplicatePayments.action')}</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {entries.map((entry) => (
            <DuplicatePaymentRow entry={entry} key={entry.registration.id} onRefund={setSelectedId} />
          ))}
        </TableBody>
      </Table>
      {selected ? (
        <RefundDailog
          event={event}
          onClose={() => setSelectedId(undefined)}
          open
          registration={selected.registration}
        />
      ) : null}
    </Alert>
  )
}
