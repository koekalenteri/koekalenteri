import type { FieldRequirements, PartialEvent } from '../types'
import { ThemeProvider } from '@mui/material/styles'
import { render } from 'vitest-browser-react'
import theme from '../../../../../assets/Theme'
import EventProperty from './EventProperty'

/** Wrapper the screenshot is taken of: a fixed width and an opaque background keep captures stable. */
const Frame = ({ children }: { readonly children: React.ReactNode }) => (
  <div
    data-testid="visual-root"
    style={{ background: '#fff', display: 'flex', flexDirection: 'column', gap: 16, padding: 16, width: 320 }}
  >
    <ThemeProvider theme={theme}>{children}</ThemeProvider>
  </div>
)

const testEvent: PartialEvent = {
  classes: [],
  createdAt: new Date(),
  createdBy: 'test',
  endDate: new Date(),
  judges: [],
  modifiedAt: new Date(),
  name: 'Syyskoe',
  startDate: new Date(),
}

const requireName: FieldRequirements = { required: { name: true }, state: {} }

it('shows a filled field, a required-but-empty error, and a disabled field stacked', async () => {
  const screen = await render(
    <Frame>
      <EventProperty id="name" options={[]} event={testEvent} freeSolo />
      <EventProperty id="name" options={[]} event={{ ...testEvent, name: '' }} fields={requireName} freeSolo />
      <EventProperty id="name" options={[]} event={testEvent} freeSolo disabled />
    </Frame>
  )

  await expect.element(screen.getByRole('combobox').first()).toHaveValue('Syyskoe')
  await expect(screen.getByTestId('visual-root')).toMatchScreenshot('event-property-states')
})
