import { DataGrid } from '@mui/x-data-grid'
import { render, screen } from '@testing-library/react'
import { vi } from 'vitest'
import { RefundFooter } from './RefundFooter'

describe('RefundFooter', () => {
  it('renders', async () => {
    render(
      <DataGrid
        columns={[]}
        slots={{ footer: RefundFooter }}
        slotProps={{
          footer: {
            canHaveHandlingCosts: true,
            handlingCost: 500,
            onHandlingCostChange: vi.fn(),
            refundBase: 1000,
            refundTotal: 500,
            total: 1000,
          },
        }}
      />
    )

    // total 10,00 € minus a 5,00 € handling cost leaves 5,00 € to refund.
    expect(screen.getByText('10,00 €')).toBeInTheDocument()
    expect(screen.getByRole('textbox')).toHaveValue('5,00')
    expect(screen.getByText('5,00 €')).toBeInTheDocument()
  })

  // A pending refund can leave nothing to give back while the default handling cost still stands
  // (KOE-1614): there is no amount to show, and no negative one.
  it('shows no amount when there is nothing to refund, whatever the handling cost', () => {
    render(
      <DataGrid
        columns={[]}
        slots={{ footer: RefundFooter }}
        slotProps={{
          footer: {
            canHaveHandlingCosts: true,
            handlingCost: 500,
            onHandlingCostChange: vi.fn(),
            refundBase: 0,
            refundTotal: -500,
            total: 0,
          },
        }}
      />
    )

    expect(screen.getByText('-')).toBeInTheDocument()
    expect(screen.queryByText(/5,00 €/)).not.toBeInTheDocument()
  })

  it('still shows the shortfall when the handling cost is above what can be refunded', () => {
    render(
      <DataGrid
        columns={[]}
        slots={{ footer: RefundFooter }}
        slotProps={{
          footer: {
            canHaveHandlingCosts: true,
            handlingCost: 500,
            onHandlingCostChange: vi.fn(),
            refundBase: 300,
            refundTotal: -200,
            total: 300,
          },
        }}
      />
    )

    expect(screen.getByText(/2,00 €/)).toBeInTheDocument()
  })
})
