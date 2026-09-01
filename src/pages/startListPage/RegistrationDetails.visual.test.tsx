import type { PublicRegistration } from '../../types/Registration'
import { ThemeProvider } from '@mui/material/styles'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import { render } from 'vitest-browser-react'
import theme from '../../assets/Theme'
import { RegistrationDetails } from './RegistrationDetails'

/** Wrapper the screenshot is taken of: a fixed width and an opaque background keep captures stable. */
const Frame = ({ children }: { readonly children: React.ReactNode }) => (
  <div data-testid="visual-root" style={{ background: '#fff', padding: 16, width: 900 }}>
    <ThemeProvider theme={theme}>{children}</ThemeProvider>
  </div>
)

// The ticket's own example row: the full pedigree line a Koiranet screenshot omits, with the
// published result on its own bolded line under it.
const registration: PublicRegistration = {
  breeder: 'Inka Heller-Schedel',
  dog: {
    breedCode: '121',
    dam: { name: 'PORTLEDGE PENELOPE', titles: 'RO MVA' },
    dob: new Date('2021-03-09T12:00:00Z'),
    gender: 'M',
    name: "FLATGOLD'S ROCKET MAN",
    regNo: 'FI13775/22',
    results: [],
    sire: { name: "FLATGOLD'S LADIES LOVE COUNTRY BOYS" },
  },
  group: { date: new Date('2026-09-12T12:00:00Z'), key: 'AVO-AP', number: 1, time: 'ap' },
  handler: 'Minsu Rauramo',
  owner: 'Minsu Rauramo',
  ownerHandles: true,
  result: 'AVO1',
}

it('runs alphabetically without numbers until the start order is confirmed', async () => {
  // KOE-1006: the class header carries the note and the rows carry no number — the dogs are real,
  // the order is not yet a promise.
  const { ClassHeader } = await import('./ClassHeader')
  const event = { classes: [] } as never
  const second: PublicRegistration = {
    ...registration,
    dog: { ...registration.dog, name: "FLATGOLD'S SECOND IN LINE", regNo: 'FI13776/22' },
    group: { ...registration.group, number: undefined },
    result: undefined,
  }

  const screen = await render(
    <Frame>
      <Table>
        <TableBody>
          <ClassHeader classValue="AVO" event={event} numbersPublished={false} />
          <RegistrationDetails
            index={0}
            registration={{ ...registration, group: { ...registration.group, number: undefined }, result: undefined }}
          />
          <RegistrationDetails index={1} registration={second} />
        </TableBody>
      </Table>
    </Frame>
  )

  await expect.element(screen.getByText(/starttij/)).toBeVisible()
  await expect(screen.getByTestId('visual-root')).toMatchScreenshot('start-list-unconfirmed-order')
})

it("holds a cancelled dog's number as a bare POISSA row", async () => {
  // KOE-1017: the published number is the dog's own — a cancellation keeps the slot occupied and
  // publishes nothing else about who it was.
  const { CancelledRegistration } = await import('./CancelledRegistration')
  const second: PublicRegistration = {
    ...registration,
    dog: { ...registration.dog, name: "FLATGOLD'S SECOND IN LINE", regNo: 'FI13776/22' },
    group: { ...registration.group, number: 3 },
    result: undefined,
  }

  const screen = await render(
    <Frame>
      <Table>
        <TableBody>
          <RegistrationDetails index={0} registration={{ ...registration, result: undefined }} />
          <CancelledRegistration groupNumber={2} />
          <RegistrationDetails index={1} registration={second} />
        </TableBody>
      </Table>
    </Frame>
  )

  await expect.element(screen.getByText('POISSA')).toBeVisible()
  await expect(screen.getByTestId('visual-root')).toMatchScreenshot('start-list-poissa-row')
})

it('publishes the result on its own line under the start list row', async () => {
  const screen = await render(
    <Frame>
      <Table>
        <TableBody>
          <RegistrationDetails index={0} registration={registration} />
        </TableBody>
      </Table>
    </Frame>
  )

  await expect.element(screen.getByText('AVO1')).toBeVisible()
  await expect(screen.getByTestId('visual-root')).toMatchScreenshot('start-list-result')
})
