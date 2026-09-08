import type { Registration } from '@/types'
import EuroOutlined from '@mui/icons-material/EuroOutlined'
import SavingsOutlined from '@mui/icons-material/SavingsOutlined'

interface PaymentIconProps {
  reg: Pick<Registration, 'paidAt' | 'refundAt' | 'refundStatus'>
  /** The fee has been paid, but not the amount it now adds up to: a part missing, or paid over. */
  unsettled?: boolean
}

const PaymentIcon = ({ reg, unsettled }: PaymentIconProps) => {
  if (reg.refundAt || reg.refundStatus === 'PENDING') {
    return <SavingsOutlined color={unsettled ? 'warning' : undefined} fontSize="small" />
  }
  return (
    <EuroOutlined color={unsettled ? 'warning' : undefined} fontSize="small" sx={{ opacity: reg.paidAt ? 1 : 0.05 }} />
  )
}

export default PaymentIcon
