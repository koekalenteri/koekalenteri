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

import { NullComponent } from '../../components/NullComponent'
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

  const canHaveHandlingCosts = selectedTransactions.some((t) => !!t.items)

  useEffect(() => {
    if (!open || !registration || registration.id === loadedId || loading) return

    setLoading(true)

    actions
      .transactions(registration.eventId, registration.id)
      .then((loaded) => {
        setTransactions((loaded ?? []).filter((t) => t.status !== 'fail' && t.status !== 'new'))
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
    if (okTransactions.length === 1) {
      setSelection([okTransactions[0].transactionId!])
      if (!okTransactions[0].items && handlingCost) {
        setHandlingCost(0)
      }
    }
  }, [handlingCost, okTransactions])

  const handleCostChange = useCallback((value?: number) => setHandlingCost(value ?? 0), [])

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

  const handleClose = useCallback(() => {
    setLoading(false)
    setLoadedId('')
    setTransactions([])
    setSelection(undefined)
    onClose?.()
  }, [onClose])

  return (
    <Dialog open={!!open} maxWidth="md" fullWidth>
      <DialogTitle>
        {t('registration.refundDialog.title', { regNo: registration.dog.regNo, payer: registration.payer.name })}
      </DialogTitle>
      <DialogContent>
        <DialogContentText sx={{ mb: 1 }}>{t('registration.refundDialog.text')}</DialogContentText>
        <StyledDataGrid
          autoHeight
          loading={loading}
          checkboxSelection
          columns={columns}
          disableColumnResize
          disableMultipleRowSelection
          getRowId={(row) => row.transactionId}
          hideFooterPagination
          hideFooterSelectedRowCount
          initialState={{
            sorting: {
              sortModel: [{ field: 'createdAt', sort: 'asc' }],
            },
          }}
          isRowSelectable={(params) => params.row.status === 'ok' && params.row.type === 'payment' && total > 0}
          onRowSelectionModelChange={setSelection}
          rows={transactions}
          rowSelectionModel={selection}
          slots={{
            footer: RefundFooter,
            noRowsOverlay: NullComponent,
          }}
          slotProps={{
            footer: {
              canHaveHandlingCosts,
              total,
              selectedTotal: refundAmount,
              handlingCost: handlingCost ?? 0,
              onHandlingCostChange: handleCostChange,
            },
          }}
        ></StyledDataGrid>
        <DialogContentText sx={{ mb: 1 }} display={selectedTransactions.length ? undefined : 'none'}>
          {t(canHaveHandlingCosts ? 'registration.refundDialog.costsText' : 'registration.refundDialog.noCostsText')}
        </DialogContentText>
      </DialogContent>
      <DialogActions>
        <Button
          variant="contained"
          onClick={handleRefund}
          disabled={total === 0 || total <= handlingCost || handlingCost < 0 || refundAmount <= handlingCost}
        >
          {t('refund')}
        </Button>
        <Button variant="outlined" onClick={handleClose}>
          {t('cancel')}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
