import type { GridRowSelectionModel } from '@mui/x-data-grid'
import type { RefundPaymentResponse, Registration, Transaction } from '../../../types'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogContentText from '@mui/material/DialogContentText'
import DialogTitle from '@mui/material/DialogTitle'

import StyledDataGrid from '../../components/StyledDataGrid'
import { useAdminRegistrationActions } from '../recoil/registrations/actions'

import { RefundFooter } from './refundDialog/RefundFooter'
import { useRefundColumns } from './refundDialog/useRefundColumns'

interface Props {
  readonly registration: Registration
  readonly open?: boolean
  readonly onClose?: () => void
}

const transactionAmount = (t: Transaction) => (t.type === 'refund' ? -1 * t.amount : t.amount)

export const RefundDailog = ({ open, registration, onClose }: Props) => {
  const { t } = useTranslation()
  const [loading, setLoading] = useState<boolean>(false)
  const [loadedId, setLoadedId] = useState<string>('')
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [selection, setSelection] = useState<GridRowSelectionModel>()
  const [handlingCost, setHandlingCost] = useState<number>(0)
  const actions = useAdminRegistrationActions(registration.eventId)
  const columns = useRefundColumns()

  const okTransactions = useMemo(() => transactions.filter((t) => t.status === 'ok'), [transactions])

  const selectedTransactions = useMemo(
    () => okTransactions.filter((t) => selection?.includes(t.transactionId)),
    [selection, okTransactions]
  )

  const total = useMemo(
    () => okTransactions.reduce((total, transaction) => total + transactionAmount(transaction), 0),
    [okTransactions]
  )
  const refundAmount = useMemo(
    () => selectedTransactions.reduce((total, transaction) => total + transactionAmount(transaction), 0),
    [selectedTransactions]
  )

  console.debug(selection)

  useEffect(() => {
    if (!open || !registration || registration.id === loadedId || loading) return

    setLoading(true)

    actions
      .transactions(registration.eventId, registration.id)
      .then((loaded) => {
        setTransactions(loaded ?? [])
        setLoading(false)
        setLoadedId(registration.id)
      })
      .catch(() => {
        setTransactions([])
        setLoading(false)
        setLoadedId(registration.id)
      })
  }, [actions, loadedId, loading, open, registration])

  useEffect(() => {
    if (okTransactions.length === 1 && okTransactions[0].items) {
      setSelection([okTransactions[0].transactionId!])
    }
  }, [okTransactions])

  const handleCostChange = useCallback((value?: number) => setHandlingCost((value ?? 0) * 100), [])

  const handleRefund = useCallback(async () => {
    let costLeft = handlingCost
    const promises: Promise<RefundPaymentResponse | undefined>[] = []

    for (const t of selectedTransactions) {
      if (t.amount < costLeft) {
        costLeft -= t.amount

        continue
      }
      promises.push(actions.refund(t.transactionId, t.amount - costLeft))
      costLeft = 0
    }

    return Promise.allSettled(promises)
  }, [actions, handlingCost, selectedTransactions])

  return (
    <Dialog open={!!open} maxWidth="md" fullWidth>
      <DialogTitle>
        {t('registration.refundDialog.title', { regNo: registration.dog.regNo, payer: registration.payer.name })}
      </DialogTitle>
      <DialogContent>
        <DialogContentText sx={{ whiteSpace: 'pre', mb: 1 }}>{t('registration.refundDialog.text')}</DialogContentText>
        <StyledDataGrid
          loading={loading}
          checkboxSelection
          columns={columns}
          disableMultipleRowSelection
          getRowId={(row) => row.transactionId}
          hideFooterPagination
          hideFooterSelectedRowCount
          isRowSelectable={(params) =>
            params.row.status === 'ok' && params.row.type === 'payment' && params.row.items && total > 0
          }
          onRowSelectionModelChange={setSelection}
          rows={transactions}
          rowSelectionModel={selection}
          slots={{
            footer: RefundFooter,
          }}
          slotProps={{
            footer: {
              total,
              selectedTotal: refundAmount,
              handlingCost: (handlingCost ?? 0) / 100,
              onHandlingCostChange: handleCostChange,
            },
          }}
        ></StyledDataGrid>
      </DialogContent>
      <DialogActions>
        <Button
          variant="contained"
          onClick={handleRefund}
          disabled={total === 0 || handlingCost < 0 || refundAmount <= handlingCost}
        >
          {t('refund')}
        </Button>
        <Button variant="outlined" onClick={onClose}>
          {t('cancel')}
        </Button>
      </DialogActions>
      1
    </Dialog>
  )
}
