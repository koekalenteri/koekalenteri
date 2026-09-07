import type { Registration } from '../../../types'
import { ThemeProvider } from '@mui/material/styles'
import { ConfirmProvider } from 'material-ui-confirm'
import { SnackbarProvider } from 'notistack'
import { Suspense } from 'react'
import { render } from 'vitest-browser-react'
import { eventWithStaticDatesAnd3Classes } from '../../../__mockData__/events'
import { registrationWithStaticDates } from '../../../__mockData__/registrations'
import theme from '../../../assets/Theme'
import { eventRegistrationDateKey } from '../../../lib/event'
import { GROUP_KEY_RESERVE } from '../../../lib/registration'
import { TestProvider } from '../../../test-utils/AtomProvider'
import { idTokenAtom } from '../../state'
import ClassEntrySelection from './ClassEntrySelection'

/** Wrapper the screenshot is taken of: a fixed width and an opaque background keep captures stable. */
const Frame = ({ children }: { readonly children: React.ReactNode }) => (
  <div data-testid="visual-root" style={{ background: '#fff', width: 1200 }}>
    <ThemeProvider theme={theme}>
      <SnackbarProvider>
        <ConfirmProvider>
          <Suspense fallback={<div>loading...</div>}>{children}</Suspense>
        </ConfirmProvider>
      </SnackbarProvider>
    </ThemeProvider>
  </div>
)

// ALO on 2021-02-10 with NOME-B splits into two groups (ap/ip); this exercises both, plus reserve.
const aloDate = eventWithStaticDatesAnd3Classes.classes[0].date
const apGroup = { date: aloDate, time: 'ap' as const }
const ipGroup = { date: aloDate, time: 'ip' as const }
const apKey = eventRegistrationDateKey(apGroup)
const ipKey = eventRegistrationDateKey(ipGroup)

const dog = (regNo: string, name: string) => ({ ...registrationWithStaticDates.dog, name, regNo })

const registrations: Registration[] = [
  {
    ...registrationWithStaticDates,
    class: 'ALO',
    dates: [apGroup],
    dog: dog('TESTDOG-0001', 'Aamun Aluke'),
    group: { ...apGroup, key: apKey, number: 1 },
    id: 'ap-1',
  },
  {
    ...registrationWithStaticDates,
    class: 'ALO',
    dates: [apGroup],
    dog: dog('TESTDOG-0002', 'Aamun Toinen'),
    group: { ...apGroup, key: apKey, number: 2 },
    id: 'ap-2',
  },
  {
    ...registrationWithStaticDates,
    class: 'ALO',
    dates: [ipGroup],
    dog: dog('TESTDOG-0003', 'Illan Aluke'),
    group: { ...ipGroup, key: ipKey, number: 1 },
    id: 'ip-1',
  },
  {
    ...registrationWithStaticDates,
    class: 'ALO',
    dates: [apGroup],
    dog: dog('TESTDOG-0004', 'Varasijan Koira'),
    group: { key: GROUP_KEY_RESERVE, number: 1 },
    id: 'reserve-1',
  },
]

it('lays out two time-of-day groups and a reserve list side by side', async () => {
  const screen = await render(
    <TestProvider initializeState={({ set }) => set(idTokenAtom, 'id-token')}>
      <Frame>
        <ClassEntrySelection event={eventWithStaticDatesAnd3Classes} eventClass="ALO" registrations={registrations} />
      </Frame>
    </TestProvider>
  )

  await expect.element(screen.getByText('Aamun Aluke')).toBeVisible()
  await expect.element(screen.getByText('Varasijan Koira')).toBeVisible()
  await expect(screen.getByTestId('visual-root')).toMatchScreenshot('class-entry-selection-groups-and-reserve')
})
