import type { DuplicatePaymentEntry } from '@/types'
import { ThemeProvider } from '@mui/material/styles'
import { createStore, Provider } from 'jotai'
import { Suspense } from 'react'
import { render } from 'vitest-browser-react'
import { eventWithStaticDates } from '@/__mockData__/events'
import theme from '@/assets/Theme'
import { describeInLanguage } from '@/test-utils/language'
import { idTokenAtom } from '../../state/user/atoms'
import DuplicatePayments from './DuplicatePayments'

// The token the validity check accepts; test-utils/utils pulls in jsdom-only helpers.
const TEST_ID_TOKEN = 'header.eyJleHAiOjQxMDI0NDQ4MDB9.signature'

const entries: DuplicatePaymentEntry[] = [
  {
    amount: 50,
    duplicatePaymentAt: new Date('2026-08-16T10:00:00.000Z'),
    registration: {
      createdAt: new Date('2026-08-01T10:00:00.000Z'),
      dog: { name: 'Korven Tessu', regNo: 'FI12345/24' },
      eventId: eventWithStaticDates.id,
      id: 'open',
      payer: { name: 'Maija Maksaja' },
      paymentStatus: 'DUPLICATE',
    },
  },
  {
    amount: 45,
    duplicatePaymentAt: new Date('2026-08-17T15:30:00.000Z'),
    registration: {
      createdAt: new Date('2026-08-02T10:00:00.000Z'),
      dog: { name: 'Metsän Musti', regNo: 'FI54321/23' },
      eventId: eventWithStaticDates.id,
      id: 'pending',
      openRefunds: ['refund-1'],
      payer: { name: 'Pekka Palautettava' },
      paymentStatus: 'DUPLICATE',
    },
  },
]

vi.mock('@/api/registration', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/api/registration')>()),
  getDuplicatePayments: async () => entries,
}))

// The dialog stays closed in these captures; only the rows are looked at.
vi.mock('../state/registrations/actions', () => ({
  useAdminRegistrationActions: () => ({ refund: async () => undefined, transactions: async () => [] }),
}))

const capture = async (shot: string) => {
  const store = createStore()
  store.set(idTokenAtom, TEST_ID_TOKEN)
  const screen = await render(
    <ThemeProvider theme={theme}>
      <Provider store={store}>
        <Suspense fallback={null}>
          <div data-testid="frame" style={{ background: '#fff', width: 1000 }}>
            <DuplicatePayments event={eventWithStaticDates} />
          </div>
        </Suspense>
      </Provider>
    </ThemeProvider>
  )
  await expect.element(screen.getByText('Korven Tessu (FI12345/24)')).toBeVisible()
  await expect(screen.getByTestId('frame')).toMatchScreenshot(shot)
}

it('lists the payments charged twice, one to refund and one on its way', () => capture('duplicate-payments'))

// The guide's English page shows the section in English (KOE-1437).
describeInLanguage('en', () => {
  it('lists the payments charged twice in English', () => capture('duplicate-payments-en'))
})
