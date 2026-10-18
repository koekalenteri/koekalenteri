import type { PaymentBalanceRegistration, PaymentPicture, PricedDogEvent, Registration } from '@/types'
import EuroOutlined from '@mui/icons-material/EuroOutlined'
import ProductionQuantityLimits from '@mui/icons-material/ProductionQuantityLimits'
import SavingsOutlined from '@mui/icons-material/SavingsOutlined'
import { useTranslation } from 'react-i18next'
import { isPaymentReturned } from '@/lib/registration'
import { isConfirmedEvent } from '@/lib/typeGuards'

interface PaymentIconProps {
  event: PricedDogEvent
  // "On its way" reads from the open refund set, not a stored refundStatus, which said nothing of
  // which refund (KOE-1529). PaymentBalanceRegistration already carries RegistrationRefundAmounts.
  reg: PaymentBalanceRegistration & Pick<Registration, 'paidAt' | 'openRefunds' | 'refundHandlingCost'>
  /**
   * The row's payment picture, worked out once for the row's icons (`getPaymentPicture`). Its
   * `unsettled` (a part missing, or paid over) holds only in a confirmed trial.
   */
  payment: PaymentPicture
}

const PaymentIcon = ({ event, payment, reg }: PaymentIconProps) => {
  const { t } = useTranslation()
  const { unsettled } = payment

  // The piggy bank for money that went back, or is on its way; a refunded fee paid again is paid
  // and shows the euro sign (KOE-1526). "On its way" reads from the open refund set, not a stored
  // PENDING, which said nothing of which refund (KOE-1529).
  if (isPaymentReturned(reg) || (reg.openRefunds?.length ?? 0) > 0) {
    return <SavingsOutlined color={unsettled ? 'warning' : undefined} fontSize="small" />
  }

  // An overpaid part that can still be returned gets its own mark, in the euro sign's place
  // (KOE-1104). The condition is money, not group: an overpaid reserve shows it too, because the
  // refund is the secretary's task either way.
  if (isConfirmedEvent(event) && payment.canRefundExcess) {
    return <ProductionQuantityLimits color="warning" fontSize="small" titleAccess={t('registration.paidExcess')} />
  }

  return (
    <EuroOutlined color={unsettled ? 'warning' : undefined} fontSize="small" sx={{ opacity: reg.paidAt ? 1 : 0.05 }} />
  )
}

export default PaymentIcon
