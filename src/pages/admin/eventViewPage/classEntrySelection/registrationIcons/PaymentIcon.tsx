import type { DogEvent, PaymentBalanceRegistration, Registration } from '@/types'
import EuroOutlined from '@mui/icons-material/EuroOutlined'
import ProductionQuantityLimits from '@mui/icons-material/ProductionQuantityLimits'
import SavingsOutlined from '@mui/icons-material/SavingsOutlined'
import { useTranslation } from 'react-i18next'
import { canRefundExcess, isPaymentUnsettled } from '@/lib/payment'
import { isPaymentReturned } from '@/lib/registration'
import { isConfirmedEvent } from '@/lib/typeGuards'

interface PaymentIconProps {
  event: DogEvent
  reg: PaymentBalanceRegistration & Pick<Registration, 'paidAt' | 'refundStatus' | 'refundHandlingCost'>
}

const PaymentIcon = ({ event, reg }: PaymentIconProps) => {
  const { t } = useTranslation()
  // The fee has been paid, but not the amount it now adds up to: a part missing, or paid over.
  // Only a confirmed event carries the fee to compare against.
  const unsettled = isConfirmedEvent(event) && isPaymentUnsettled(event, reg)

  // The piggy bank for money that went back, or is on its way; a refunded fee paid again is paid
  // and shows the euro sign (KOE-1526).
  if (isPaymentReturned(reg) || reg.refundStatus === 'PENDING') {
    return <SavingsOutlined color={unsettled ? 'warning' : undefined} fontSize="small" />
  }

  // An overpaid part that can still be returned gets its own mark, in the euro sign's place
  // (KOE-1104). The condition is money, not group: an overpaid reserve shows it too, because the
  // refund is the secretary's task either way.
  if (isConfirmedEvent(event) && canRefundExcess(event, reg)) {
    return <ProductionQuantityLimits color="warning" fontSize="small" titleAccess={t('registration.paidExcess')} />
  }

  return (
    <EuroOutlined color={unsettled ? 'warning' : undefined} fontSize="small" sx={{ opacity: reg.paidAt ? 1 : 0.05 }} />
  )
}

export default PaymentIcon
