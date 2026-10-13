import type { Registration } from '@/types'
import EuroOutlined from '@mui/icons-material/EuroOutlined'
import SavingsOutlined from '@mui/icons-material/SavingsOutlined'
import { isPaymentReturned } from '@/lib/registration'

interface PaymentIconProps {
  reg: Pick<Registration, 'paidAmount' | 'paidAt' | 'refundAmount' | 'refundHandlingCost' | 'refundStatus'>
  /** The fee has been paid, but not the amount it now adds up to: a part missing, or paid over. */
  unsettled?: boolean
}

const PaymentIcon = ({ reg, unsettled }: PaymentIconProps) => {
  // The piggy bank for money that went back, or is on its way; a refunded fee paid again is paid
  // and shows the euro sign (KOE-1526).
  if (isPaymentReturned(reg) || reg.refundStatus === 'PENDING') {
    return <SavingsOutlined color={unsettled ? 'warning' : undefined} fontSize="small" />
  }
  return (
    <EuroOutlined color={unsettled ? 'warning' : undefined} fontSize="small" sx={{ opacity: reg.paidAt ? 1 : 0.05 }} />
  )
}

export default PaymentIcon
