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
            refundTotal: 500,
            selectedTotal: 1000,
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
})
