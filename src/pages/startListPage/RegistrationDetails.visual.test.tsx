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
