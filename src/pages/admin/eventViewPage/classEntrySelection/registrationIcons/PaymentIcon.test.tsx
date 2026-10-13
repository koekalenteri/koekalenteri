import { render, screen } from '@testing-library/react'
import PaymentIcon from './PaymentIcon'

describe('PaymentIcon', () => {
  it('should render SavingsOutlined icon when the payment went back', () => {
    const reg = {
      paidAmount: 50,
      paidAt: new Date(),
      refundAmount: 50,
      refundAt: new Date(),
    }

    render(<PaymentIcon reg={reg} />)

    // SavingsOutlined icon has this path
    expect(screen.getByTestId('SavingsOutlinedIcon')).toBeInTheDocument()
  })

  // KOE-1526 review: a reserve refunded and then lifted into a place that paid again is paid.
  it('should render EuroOutlined icon when a refunded fee has been paid again', () => {
    const reg = {
      paidAmount: 100,
      paidAt: new Date(),
      refundAmount: 50,
      refundAt: new Date(),
    }

    render(<PaymentIcon reg={reg} />)

    expect(screen.getByTestId('EuroOutlinedIcon')).toBeInTheDocument()
  })

  it('should render SavingsOutlined icon when refundStatus is PENDING', () => {
    const reg = {
      paidAt: new Date(),
      refundStatus: 'PENDING' as const,
    }

    render(<PaymentIcon reg={reg} />)

    expect(screen.getByTestId('SavingsOutlinedIcon')).toBeInTheDocument()
  })

  it('should render EuroOutlined icon with full opacity when paidAt is set', () => {
    const reg = {
      paidAt: new Date(),
    }

    render(<PaymentIcon reg={reg} />)

    const icon = screen.getByTestId('EuroOutlinedIcon')
    expect(icon).toBeInTheDocument()
    expect(icon).toHaveStyle('opacity: 1')
  })

  it('should render EuroOutlined icon with low opacity when paidAt is not set', () => {
    const reg = {}

    render(<PaymentIcon reg={reg} />)

    const icon = screen.getByTestId('EuroOutlinedIcon')
    expect(icon).toBeInTheDocument()
    expect(icon).toHaveStyle('opacity: 0.05')
  })
})
