import type { ConfirmedEvent, Registration } from '@/types'
import { ThemeProvider } from '@mui/material/styles'
import { render } from 'vitest-browser-react'
import { eventWithStations, registrationsToEventWithStations } from '@/__mockData__/resultsEvent'
import theme from '@/assets/Theme'
import { TestProvider } from '@/test-utils/AtomProvider'
import { freezeClockAt } from '@/test-utils/freezeClock'
import { adminEventsAtom, adminEventTypesAtom } from '../../state'
import KennelliittoSubmission from './KennelliittoSubmission'

// The trial is long past; a day of its own keeps what the section says about it from moving (KOE-1423).
freezeClockAt('2026-09-07')

// A section that shows the trial locked reads Kennelliitto's state afresh; the answer is not what these
// captures are about.
vi.mock(import('@/api/registration'), async (importOriginal) => ({
  ...(await importOriginal()),
  previewKennelliittoResults: vi.fn(async () => ({ blockers: [], dogs: [] })),
}))

const sentAt = new Date('2026-09-26T10:00:00Z')

/** The event view's read of Kennelliitto's state, which these captures do not exercise. */
const noStateRead = async () => undefined

// One dog of each class has run; the ALO one is in Omakoira, the AVO one not yet.
const registrations: Registration[] = registrationsToEventWithStations.map((registration) => {
  if (registration.id === 'run-1') {
    return {
      ...registration,
      kcResult: { at: sentAt, by: 'Sihteeri', payloadHash: 'h', resultVersion: sentAt.toISOString(), status: 'sent' },
    }
  }
  return registration.id === 'run-2' ? { ...registration, class: 'AVO' } : registration
})

/** As wide as the event management drawer's sections: a fixed width and an opaque background keep captures stable. */
const capture = async (event: ConfirmedEvent, name: string, ready: string) => {
  const screen = await render(
    <div data-testid="visual-root" style={{ background: '#fff', padding: 12, width: 456 }}>
      <ThemeProvider theme={theme}>
        <TestProvider
          initializeState={({ set }) => {
            set(adminEventsAtom, [event])
            void set(adminEventTypesAtom, [])
          }}
        >
          <KennelliittoSubmission event={event} onRefreshState={noStateRead} registrations={registrations} />
        </TestProvider>
      </ThemeProvider>
    </div>
  )

  await expect.element(screen.getByText(ready)).toBeVisible()
  await expect(screen.getByTestId('visual-root')).toMatchScreenshot(name)
}

// Sending to Omakoira is a step of its own in the event management (KOE-1579): where each class
// stands, the sending, and the hand-over once something has been sent.
it('says how far the sending has got and offers the hand-over', async () => {
  await capture(eventWithStations, 'kennelliitto-submission', 'Luovuta tuomarille')
})

it('says the trial is with the chief judge, with a way to read the state again', async () => {
  const handedOver = {
    ...eventWithStations,
    kcState: { code: 1253, name: 'Ylituomarin hyväksyttäväksi', readAt: sentAt },
  }

  await capture(handedOver, 'kennelliitto-submission-handed-over', 'Päivitä tila')
})

it('offers the lookup where the trial is not yet linked to Kennelliitto', async () => {
  await capture({ ...eventWithStations, kcGuid: undefined }, 'kennelliitto-submission-unlinked', 'Liitä koetunnus')
})
