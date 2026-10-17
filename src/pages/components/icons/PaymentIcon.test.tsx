import type { PaymentPictureStatus } from '@/types'
import { render, screen } from '@testing-library/react'
import { DIM_OPACITY } from './constants'
import { PaymentIcon } from './PaymentIcon'

// The participant's euro sign shows what the payment line says (KOE-1526).
describe('PaymentIcon', () => {
  it.each<[PaymentPictureStatus, string, string]>([
    ['paid', 'EuroOutlinedIcon', '1'],
    ['overpaid', 'EuroOutlinedIcon', '1'],
    ['partial', 'EuroOutlinedIcon', '1'],
    ['inProgress', 'PauseCircleOutlinedIcon', '1'],
    ['refunded', 'EuroOutlinedIcon', String(DIM_OPACITY)],
    ['unpaid', 'EuroOutlinedIcon', String(DIM_OPACITY)],
    ['duplicate', 'EuroOutlinedIcon', String(DIM_OPACITY)],
    ['waitingForPlace', 'EuroOutlinedIcon', String(DIM_OPACITY)],
    ['notCharged', 'EuroOutlinedIcon', String(DIM_OPACITY)],
  ])('dimmed, shows %s as %s with opacity %s', (status, icon, opacity) => {
    render(<PaymentIcon dim status={status} />)

    expect(screen.getByTestId(icon)).toHaveAttribute('opacity', opacity)
  })

  it('is never dimmed unless asked to be', () => {
    render(<PaymentIcon status="unpaid" />)

    expect(screen.getByTestId('EuroOutlinedIcon')).toHaveAttribute('opacity', '1')
  })
})
