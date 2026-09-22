import type { StartNumberDog } from './StartNumbersEntry'
import { TZDate } from '@date-fns/tz'
import { ThemeProvider } from '@mui/material/styles'
import Typography from '@mui/material/Typography'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { render } from 'vitest-browser-react'
import theme from '@/assets/Theme'
import { TIME_ZONE } from '@/i18n/dates'
import { describeInLanguage } from '@/test-utils/language'
import { ClassLinksTab } from './ClassLinksTab'
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

/** The event secretary's sheet; the page's title over it comes in as text, in the page's language. */
const secretarySheet = (title: string) => (
  <StartNumbersEntry
    header={
      <Typography sx={{ pb: 1 }} variant="h6">
        {title}
      </Typography>
    }
    onSave={noop}
    registrations={registrations}
    renderLinks={(classes) => <ClassLinksTab classes={classes} onCopy={() => undefined} onRevoke={() => undefined} />}
  />
)

/** The class secretary's sheet: one class on it and nothing to hand on. */
const classLinkSheet = (
  <StartNumbersEntry
    header={
      <Typography
        variant="body2"
        sx={{
          color: 'text.secondary',
          pb: 1,
        }}
      >
        12.9.2026 NOWT Ranua Syyskoe
      </Typography>
    }
    onSave={noop}
    registrations={registrations.filter((item) => item.class === 'ALO')}
  />
)

// The event secretary's sheet: the classes as tabs, and the hand-out sheet as one more tab at the
// row's far end, out of the way of the numbers (KOE-1433).
it('keeps the class links on a tab of their own, after the classes', async () => {
  const screen = await renderSheet(secretarySheet('Starttinumeroiden syöttö'))

  await expect.element(screen.getByText('Ensimmainen')).toBeVisible()
  await expect(screen.getByTestId('visual-root')).toMatchScreenshot('start-numbers-entry-secretary')
})

// The links tab is every class of the trial together, in place of the numbers: nothing to save there.
it('hands out every class from the links tab', async () => {
  const screen = await renderSheet(secretarySheet('Starttinumeroiden syöttö'))

  await screen.getByRole('tab', { name: 'Luokkasihteerien linkit' }).click()

  await expect.element(screen.getByRole('button', { name: 'Kopioi linkki' }).first()).toBeVisible()
  await expect.element(screen.getByRole('button', { name: 'Tallenna numerot' })).not.toBeInTheDocument()
  await expect(screen.getByTestId('visual-root')).toMatchScreenshot('start-numbers-entry-links')
})

// The class secretary's link opens the same sheet with one class on it and nothing to hand on.
it('is the same sheet through a class link, without the link controls', async () => {
  const screen = await renderSheet(classLinkSheet)

  await expect.element(screen.getByText('Ensimmainen')).toBeVisible()
  await expect(screen.getByTestId('visual-root')).toMatchScreenshot('start-numbers-entry-class-link')
})

// The guide's English page shows the three sheets in English (KOE-1437).
describeInLanguage('en', () => {
  it('keeps the class links on a tab of their own, after the classes', async () => {
    const screen = await renderSheet(secretarySheet('Start number entry'))

    await expect.element(screen.getByText('Ensimmainen')).toBeVisible()
    await expect.element(screen.getByRole('tab', { name: "Class secretaries' links" })).toBeVisible()
    await expect(screen.getByTestId('visual-root')).toMatchScreenshot('start-numbers-entry-secretary-en')
  })

  it('hands out every class from the links tab', async () => {
    const screen = await renderSheet(secretarySheet('Start number entry'))

    await screen.getByRole('tab', { name: "Class secretaries' links" }).click()

    await expect.element(screen.getByRole('button', { name: 'Copy link' }).first()).toBeVisible()
    await expect.element(screen.getByRole('button', { name: 'Save numbers' })).not.toBeInTheDocument()
    await expect(screen.getByTestId('visual-root')).toMatchScreenshot('start-numbers-entry-links-en')
  })

  it('is the same sheet through a class link, without the link controls', async () => {
    const screen = await renderSheet(classLinkSheet)

    await expect.element(screen.getByText('Ensimmainen')).toBeVisible()
    await expect.element(screen.getByRole('button', { name: 'Save numbers' })).toBeVisible()
    await expect(screen.getByTestId('visual-root')).toMatchScreenshot('start-numbers-entry-class-link-en')
  })
})
