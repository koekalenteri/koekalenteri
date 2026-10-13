import type { PaymentStatusKey } from '@/lib/payment'
import { render, screen } from '@testing-library/react'
import { DIM_OPACITY } from './constants'
import { PaymentIcon } from './PaymentIcon'

// The participant's euro sign shows what the payment line says (KOE-1526).
describe('PaymentIcon', () => {
  it.each<[PaymentStatusKey, string, string]>([
    ['paymentStatus.success', 'EuroOutlinedIcon', '1'],
    ['paymentStatus.partial', 'EuroOutlinedIcon', '1'],
    ['paymentStatus.pending', 'PauseCircleOutlinedIcon', '1'],
    ['paymentStatus.refunded', 'EuroOutlinedIcon', String(DIM_OPACITY)],
    ['paymentStatus.missing', 'EuroOutlinedIcon', String(DIM_OPACITY)],
    ['paymentStatus.notCharged', 'EuroOutlinedIcon', String(DIM_OPACITY)],
  ])('dimmed, shows %s as %s with opacity %s', (status, icon, opacity) => {
    render(<PaymentIcon dim status={status} />)

    expect(screen.getByTestId(icon)).toHaveAttribute('opacity', opacity)
  })

  it('is never dimmed unless asked to be', () => {
    render(<PaymentIcon status="paymentStatus.missing" />)

    expect(screen.getByTestId('EuroOutlinedIcon')).toHaveAttribute('opacity', '1')
  })
})
