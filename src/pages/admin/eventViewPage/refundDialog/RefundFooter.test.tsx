import { DataGrid } from '@mui/x-data-grid'
import { render } from '@testing-library/react'
import { vi } from 'vitest'
import { RefundFooter } from './RefundFooter'

describe('RefundFooter', () => {
  it('renders', async () => {
    const { container } = render(
      <DataGrid
        columns={[]}
        slots={{ footer: RefundFooter }}
        slotProps={{
          footer: {
            canHaveHandlingCosts: true,
            handlingCost: 500,
            onHandlingCostChange: vi.fn(),
            selectedTotal: 1000,
            total: 1000,
          },
        }}
      />
    )
    expect(container).toMatchSnapshot()
  })
})
