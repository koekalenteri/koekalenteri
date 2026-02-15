import type { Registration } from '../../../../../types'
import EuroOutlined from '@mui/icons-material/EuroOutlined'
import SavingsOutlined from '@mui/icons-material/SavingsOutlined'

interface PaymentIconProps {
  reg: Pick<Registration, 'paidAt' | 'refundAt' | 'refundStatus'>
}

const PaymentIcon = ({ reg }: PaymentIconProps) => {
  if (reg.refundAt || reg.refundStatus === 'PENDING') {
    return <SavingsOutlined fontSize="small" />
  }
  return <EuroOutlined fontSize="small" sx={{ opacity: reg.paidAt ? 1 : 0.05 }} />
}

export default PaymentIcon
