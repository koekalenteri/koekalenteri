import type { Registration } from '../../../types'
import { ThemeProvider } from '@mui/material/styles'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import { render } from 'vitest-browser-react'
import { registrationWithStaticDates } from '../../../__mockData__/registrations'
import theme from '../../../assets/Theme'
import StartListGroup from './StartListGroup'

/** Wrapper the screenshot is taken of: a fixed width and an opaque background keep captures stable. */
const Frame = ({ children }: { readonly children: React.ReactNode }) => (
  <div data-testid="visual-root" style={{ background: '#fff', padding: 16, width: 1400 }}>
    <ThemeProvider theme={theme}>
      <Table size="small">
        <TableBody>{children}</TableBody>
      </Table>
    </ThemeProvider>
  </div>
)

const entry = (id: string, name: string, number: number, overrides: Partial<Registration> = {}): Registration => ({
  ...registrationWithStaticDates,
  dog: { ...registrationWithStaticDates.dog, name, regNo: `REG-${id}` },
  group: { date: new Date('2021-02-10T10:00:00Z'), key: 'ALO-AP', number, time: 'ap' },
  id,
  ...overrides,
})

it('shows a class group of the secretary start list', async () => {
  const regs = [entry('run-1', 'Ensimmäinen', 1), entry('run-2', 'Toinen', 2)]
  const group: Record<string, Record<string, Registration[]>> = { ALO: { ap: regs } }

  const screen = await render(
    <Frame>
      <StartListGroup
        colSpan={8}
        eventClass="ALO"
        group={group}
        heading="ke 10.2."
        nameLen={12}
        reserve={false}
        time="ap"
      />
    </Frame>
  )

  await expect.element(screen.getByText('REG-run-1')).toBeVisible()
  await expect(screen.getByTestId('visual-root')).toMatchScreenshot('startlist-secretary-group')
})

it('shows the reserve group with location and notice columns', async () => {
  const regs = [
    entry('reserve-1', 'Varakoira', 1, { group: { key: 'reserve', number: 1 }, reserve: 'DAY' }),
    entry('reserve-2', 'Toinen vara', 2, {
      group: { key: 'reserve', number: 2 },
      handler: { ...registrationWithStaticDates.handler, phone: undefined },
      reserve: 'WEEK',
    }),
  ]
  const group: Record<string, Record<string, Registration[]>> = { ALO: { kp: regs } }

  const screen = await render(
    <Frame>
      <StartListGroup colSpan={10} eventClass="ALO" group={group} heading="Varalla" nameLen={12} reserve time="kp" />
    </Frame>
  )

  await expect.element(screen.getByText('REG-reserve-1')).toBeVisible()
  await expect(screen.getByTestId('visual-root')).toMatchScreenshot('startlist-secretary-reserve')
})
