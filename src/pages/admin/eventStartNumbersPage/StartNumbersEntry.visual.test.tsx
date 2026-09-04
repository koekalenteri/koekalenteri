import type { StartNumberDog } from './StartNumbersEntry'
import { TZDate } from '@date-fns/tz'
import Button from '@mui/material/Button'
import Stack from '@mui/material/Stack'
import { ThemeProvider } from '@mui/material/styles'
import Typography from '@mui/material/Typography'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { render } from 'vitest-browser-react'
import theme from '../../../assets/Theme'
import { TIME_ZONE } from '../../../i18n/dates'
import { StartNumbersEntry } from './StartNumbersEntry'

/**
 * Wrapper the screenshot is taken of: a fixed width and an opaque background keep captures stable.
 * The sheet warns about unsaved entries through the router's blocker (KOE-1283), so it needs a data
 * router around it even here.
 */
const Frame = ({ children }: { readonly children: React.ReactNode }) => (
  <div
    data-testid="visual-root"
    style={{ background: '#fff', display: 'flex', flexDirection: 'column', padding: 16, width: 900 }}
  >
    <ThemeProvider theme={theme}>{children}</ThemeProvider>
  </div>
)

const renderSheet = (children: React.ReactNode) =>
  render(<RouterProvider router={createMemoryRouter([{ element: <Frame>{children}</Frame>, path: '/' }])} />)

// Pinned so the day labels stay still whenever this runs.
const DAY = new TZDate(2026, 8, 12, TIME_ZONE)

const dog = (id: string, eventClass: string, number: number, name: string): StartNumberDog => ({
  class: eventClass,
  dog: { name, regNo: `FI${number}0000/26` },
  eventType: 'NOWT',
  group: { date: DAY, key: `${eventClass}-AP`, number, time: 'ap' },
  handler: { name: `Ohjaaja ${number}` },
  id,
})

// ALO holds 1–2 of the working order and AVO 3–4: the class tabs are the sheets, and each class draws
// inside its own block.
const registrations = [
  dog('alo-1', 'ALO', 1, 'Ensimmainen'),
  dog('alo-2', 'ALO', 2, 'Toinen'),
  dog('avo-1', 'AVO', 3, 'Kolmas'),
]

const noop = async () => true

it("offers the open class's sheet as a link of its own", async () => {
  const screen = await renderSheet(
    <StartNumbersEntry
      header={
        <Typography sx={{ pb: 1 }} variant="h6">
          Starttinumeroiden syöttö
        </Typography>
      }
      onSave={noop}
      registrations={registrations}
      renderClassActions={(eventClass) => (
        <Stack direction="row" justifyContent="flex-end" spacing={1} sx={{ px: 2 }}>
          <Button size="small">Kopioi luokkasihteerin linkki</Button>
          <Button size="small">Mitätöi luokan linkit ({eventClass})</Button>
        </Stack>
      )}
    />
  )

  await expect.element(screen.getByText('Ensimmainen')).toBeVisible()
  await expect(screen.getByTestId('visual-root')).toMatchScreenshot('start-numbers-entry-secretary')
})

// The class secretary's link opens the same sheet with one class on it and nothing to hand on.
it('is the same sheet through a class link, without the link controls', async () => {
  const screen = await renderSheet(
    <StartNumbersEntry
      header={
        <Typography sx={{ pb: 1 }} variant="body2" color="text.secondary">
          12.9.2026 NOWT Ranua Syyskoe
        </Typography>
      }
      onSave={noop}
      registrations={registrations.filter((item) => item.class === 'ALO')}
    />
  )

  await expect.element(screen.getByText('Ensimmainen')).toBeVisible()
  await expect(screen.getByTestId('visual-root')).toMatchScreenshot('start-numbers-entry-class-link')
})
