import { ThemeProvider } from '@mui/material/styles'
import { DataGrid } from '@mui/x-data-grid'
import { render } from 'vitest-browser-react'
import theme from '../../../../assets/Theme'
import { RefundFooter } from './RefundFooter'

/** Wrapper the screenshot is taken of: a fixed width and an opaque background keep captures stable. */
const Frame = ({ children }: { readonly children: React.ReactNode }) => (
  <div data-testid="visual-root" style={{ background: '#fff', width: 400 }}>
    <ThemeProvider theme={theme}>{children}</ThemeProvider>
  </div>
)

it('lines up the total, the handling cost, and the refund amount with their currency', async () => {
  const screen = await render(
    <Frame>
      <DataGrid
        columns={[{ field: 'name', headerName: 'Nimi', width: 200 }]}
        rows={[{ id: 1, name: 'Test Dog' }]}
        slots={{ footer: RefundFooter }}
        slotProps={{
          footer: {
            canHaveHandlingCosts: true,
            handlingCost: 500,
            onHandlingCostChange: () => {},
            refundTotal: 500,
            selectedTotal: 1000,
            total: 1000,
          },
        }}
      />
    </Frame>
  )

  await expect.element(screen.getByText('10,00 €')).toBeVisible()
  await expect(screen.getByTestId('visual-root')).toMatchScreenshot('refund-footer-amounts')
})
