import type { KcDogReport } from '@/lib/kennelliittoResults'
import type { TestStore } from '@/test-utils/AtomProvider'
import type { ConfirmedEvent, Registration } from '@/types'
import { ThemeProvider } from '@mui/material'
import { act, cleanup, screen, within } from '@testing-library/react'
import { useAtomValue } from 'jotai'
import { Suspense } from 'react'
import { eventWithStaticDates } from '@/__mockData__/events'
import { RESULTS_EVENT_DAY, registrationsToEventWithStations } from '@/__mockData__/resultsEvent'
import { putEvent, searchEventKcIdChoices } from '@/api/event'
import { APIError } from '@/api/http'
import { handOverKennelliittoResults, previewKennelliittoResults, sendKennelliittoResults } from '@/api/registration'
import theme from '@/assets/Theme'
import AppSnackbarProvider from '@/pages/components/AppSnackbarProvider'
import { idTokenAtom } from '@/pages/state'
import { TestProvider } from '@/test-utils/AtomProvider'
import { expectConsoleOutput } from '@/test-utils/consoleGuard'
import { describeWithTranslations } from '@/test-utils/language'
import { flushPromises, renderSuspendedWithUserEvents, TEST_ID_TOKEN } from '@/test-utils/utils'
import { adminConfirmedEventAtom, adminEventRegistrationsAtom, adminEventsAtom } from '../../state'
import KennelliittoSubmission from './KennelliittoSubmission'

vi.mock('react-i18next', async (importOriginal) =>
  (await import('@/test-utils/language')).spyOnUseTranslation(importOriginal)
)
vi.mock('@/api/user')
vi.mock('@/api/event')
vi.mock('@/api/eventType')
vi.mock('@/api/registration')

const noon = new Date('2021-02-10T12:00:00Z')
const sentOk = {
  at: noon,
  by: 'Sihteeri',
  payloadHash: 'h',
  resultVersion: noon.toISOString(),
  status: 'sent' as const,
}
const dogReport = (
  id: string,
  status: 'blocked' | 'changed' | 'ready' | 'unchanged',
  problems: KcDogReport['problems'] = []
) => ({
  id,
  name: `Koira ${id}`,
  problems,
  regNo: `REG-${id}`,
  status,
})

/** A trial Kennelliitto has with the chief judge. */
const handedOver: ConfirmedEvent = { ...eventWithStaticDates, kcState: { code: 1253, name: 'x', readAt: noon } }

/** The section as the info panel shows it: the event and its dogs as the admin atoms hold them. */
const Section = ({
  eventId,
  onRefreshState,
}: {
  readonly eventId: string
  readonly onRefreshState: () => Promise<unknown>
}) => {
  const event = useAtomValue(adminConfirmedEventAtom(eventId))
  const registrations = useAtomValue(adminEventRegistrationsAtom(eventId))
  if (!event) return null
  return <KennelliittoSubmission event={event} onRefreshState={onRefreshState} registrations={registrations} />
}

const renderSection = async (
  event: ConfirmedEvent = eventWithStaticDates,
  extra: Record<string, Partial<Registration>> = {}
) => {
  const registrations = registrationsToEventWithStations.map((reg) => ({
    ...reg,
    class: undefined,
    eventId: event.id,
    eventType: event.eventType,
    ...extra[reg.id],
  }))
  let store: TestStore | undefined
  // The event view's own read of Kennelliitto's state (useResultsLock), which the section's refresh calls.
  const refreshState = vi.fn(async () => ({}))
  const result = await renderSuspendedWithUserEvents(
    <ThemeProvider theme={theme}>
      <TestProvider
        initializeState={(initial) => {
          store = initial
          initial.set(idTokenAtom, TEST_ID_TOKEN)
          initial.set(adminEventsAtom, [event])
          initial.set(adminEventRegistrationsAtom(event.id), registrations)
        }}
      >
        <Suspense fallback={<div>loading...</div>}>
          <AppSnackbarProvider>
            <Section eventId={event.id} onRefreshState={refreshState} />
          </AppSnackbarProvider>
        </Suspense>
      </TestProvider>
    </ThemeProvider>,
    undefined,
    { advanceTimers: vi.advanceTimersByTime }
  )
  await flushPromises()
  if (!store) throw new Error('no store')
  return { ...result, refreshState, store }
}

const sendButton = () => screen.getByRole('button', { name: 'results.kennelliitto.send' })
const handOverButton = () => screen.getByRole('button', { name: 'results.kennelliitto.handOverButton' })

describe('KennelliittoSubmission (KOE-1579)', () => {
  beforeAll(() => vi.useFakeTimers())
  afterEach(() => {
    cleanup()
    vi.runOnlyPendingTimers()
  })
  afterAll(() => vi.useRealTimers())

  it('offers the sending', async () => {
    await renderSection()

    expect(screen.getByText('results.kennelliitto.title')).toBeInTheDocument()
    expect(sendButton()).toBeEnabled()
  })

  describeWithTranslations('fi', () => {
    it('says how many dogs have their result in Omakoira', async () => {
      await renderSection(eventWithStaticDates, { 'run-1': { kcResult: sentOk } })

      const row = within(screen.getByRole('row'))
      expect(row.getByText('NOU')).toBeInTheDocument()
      expect(row.getByText('Lähetetty Omakoiraan: 1 / 2')).toBeInTheDocument()
    })

    it('counts each class on its own row', async () => {
      const twoClasses: ConfirmedEvent = {
        ...eventWithStaticDates,
        classes: [
          { class: 'ALO', date: eventWithStaticDates.startDate },
          { class: 'AVO', date: eventWithStaticDates.startDate },
        ],
        eventType: 'NOME-B',
      }
      await renderSection(twoClasses, {
        'run-1': { class: 'ALO', eventType: 'NOME-B', kcResult: sentOk },
        'run-2': { class: 'AVO', eventType: 'NOME-B' },
      })

      const [alo, avo] = screen.getAllByRole('row')
      expect(alo).toHaveTextContent('ALOLähetetty Omakoiraan: 1 / 1')
      expect(avo).toHaveTextContent('AVOLähetetty Omakoiraan: 0 / 1')
    })
  })

  describe('when it can be sent, by the step indicator’s own rule', () => {
    // A trial still ahead by its date, its event-level state not moved on: only a class's state says it has begun.
    const ahead = (avo: 'invited' | 'started'): ConfirmedEvent => ({
      ...eventWithStaticDates,
      classes: [
        { class: 'ALO', date: '2099-06-05', state: 'invited' },
        { class: 'AVO', date: '2099-06-05', state: avo },
      ],
      endDate: '2099-06-05',
      eventType: 'NOME-B',
      startDate: '2099-06-05',
      state: 'invited',
    })

    it('offers no sending before any class has begun', async () => {
      await renderSection(ahead('invited'))

      expect(sendButton()).toBeDisabled()
    })

    it('offers the sending once one class has begun, as the step asks for it', async () => {
      await renderSection(ahead('started'))

      expect(sendButton()).toBeEnabled()
    })
  })

  it('offers the hand-over only once something has been sent', async () => {
    await renderSection()

    expect(screen.queryByRole('button', { name: 'results.kennelliitto.handOverButton' })).not.toBeInTheDocument()
  })

  it('offers the hand-over for a result sent for a dog whose entry was cancelled since', async () => {
    // What was sent is in Kennelliitto all the same, and the results page says so: the two views count alike.
    await renderSection(eventWithStaticDates, { 'run-1': { cancelled: true, kcResult: sentOk } })

    expect(handOverButton()).toBeInTheDocument()
  })

  describe('a trial without a koetunnus', () => {
    const unlinked: ConfirmedEvent = { ...eventWithStaticDates, kcGuid: undefined }

    it('offers the lookup, which every sending needs first', async () => {
      await renderSection(unlinked)

      expect(screen.getByRole('button', { name: 'event.kcIdLookup' })).toBeInTheDocument()
    })

    it('saves the trial found onto the event', async () => {
      vi.mocked(searchEventKcIdChoices).mockResolvedValueOnce({
        choices: [
          {
            classes: [],
            endDate: eventWithStaticDates.endDate,
            eventType: 'NOU',
            kcGuid: 'guid-b',
            name: '',
            organizer: 'Järjestäjä',
            startDate: eventWithStaticDates.startDate,
          },
        ],
      })
      const { user } = await renderSection(unlinked)

      await user.click(screen.getByRole('button', { name: 'event.kcIdLookup' }))
      await flushPromises()

      expect(putEvent).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'test1', kcGuid: 'guid-b' }),
        expect.anything()
      )
    })

    it('is not offered where the trial is linked', async () => {
      await renderSection()

      expect(screen.queryByRole('button', { name: 'event.kcIdLookup' })).not.toBeInTheDocument()
    })
  })

  describe('the sending dialog', () => {
    const openSend = async () => {
      const rendered = await renderSection()
      await rendered.user.click(sendButton())
      await flushPromises()
      return rendered
    }

    it('asks the question about the whole trial and says the results can still be corrected until the hand-over', async () => {
      vi.mocked(previewKennelliittoResults).mockResolvedValueOnce({ blockers: [], dogs: [dogReport('run-1', 'ready')] })

      await openSend()

      expect(screen.getByText('results.kennelliitto.confirm')).toBeInTheDocument()
      expect(screen.getByText('results.kennelliitto.confirmNote')).toBeInTheDocument()
      // The sentence about no more editing belongs to the hand-over, not to the sending.
      expect(screen.queryByText('results.kennelliitto.handOver.confirm')).not.toBeInTheDocument()
      expect(previewKennelliittoResults).toHaveBeenLastCalledWith('test1', undefined, expect.anything(), undefined)
      expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument()
    })

    it('lists what stops the trial and does not let it be sent', async () => {
      vi.mocked(previewKennelliittoResults).mockResolvedValueOnce({
        blockers: [{ code: 'stateNotWritable', detail: 'Valmistunut' }],
        dogs: [],
      })

      await openSend()

      expect(screen.getByText('results.kennelliitto.blocker.stateNotWritable detail')).toBeInTheDocument()
      const dialog = within(screen.getByRole('dialog'))
      expect(dialog.getByRole('button', { name: 'results.kennelliitto.send' })).toBeDisabled()
    })

    it('says so when the preview cannot be read', async () => {
      vi.mocked(previewKennelliittoResults).mockRejectedValueOnce(new Error('Network Error'))
      expectConsoleOutput(/reportError .*Network Error/)

      await openSend()

      expect(screen.getByText('results.kennelliitto.statusUnknown status')).toBeInTheDocument()
    })

    it('names the dogs that cannot be sent, with the reason', async () => {
      vi.mocked(previewKennelliittoResults).mockResolvedValueOnce({
        blockers: [],
        dogs: [dogReport('run-1', 'ready'), dogReport('run-2', 'blocked', [{ code: 'noJudge' }])],
      })

      await openSend()

      expect(screen.getByText(/Koira run-2 \(REG-run-2\): results.kennelliitto.problem.noJudge/)).toBeInTheDocument()
    })

    it('sends the dogs ten at a time and reports who was saved and who was refused, in Kennelliitto’s words', async () => {
      const ids = Array.from({ length: 12 }, (_unused, index) => `dog-${index}`)
      vi.mocked(previewKennelliittoResults).mockResolvedValueOnce({
        blockers: [],
        dogs: ids.map((id) => dogReport(id, 'ready')),
      })
      vi.mocked(sendKennelliittoResults)
        .mockResolvedValueOnce({
          blockers: [],
          notAttempted: [],
          patches: [],
          reports: ids
            .slice(0, 10)
            .map((id) => ({ id, name: `Koira ${id}`, outcome: 'sent' as const, regNo: `REG-${id}` })),
        })
        .mockResolvedValueOnce({
          blockers: [],
          notAttempted: [],
          patches: [],
          reports: [
            { id: 'dog-10', name: 'Koira dog-10', outcome: 'sent' as const, regNo: 'REG-dog-10' },
            {
              errors: ['Koiran nimi ei täsmää.'],
              id: 'dog-11',
              name: 'Koira dog-11',
              outcome: 'failed' as const,
              regNo: 'REG-dog-11',
              status: 400,
            },
          ],
        })
      const { user } = await openSend()

      await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'results.kennelliitto.send' }))
      // Two requests, one after the other: each answer settles the state before the next goes.
      await flushPromises()
      await flushPromises()

      expect(sendKennelliittoResults).toHaveBeenNthCalledWith(
        1,
        'test1',
        ids.slice(0, 10),
        { force: false, switchRegNos: [] },
        expect.anything()
      )
      expect(sendKennelliittoResults).toHaveBeenNthCalledWith(
        2,
        'test1',
        ids.slice(10),
        { force: false, switchRegNos: [] },
        expect.anything()
      )
      expect(screen.getByText('results.kennelliitto.success count')).toBeInTheDocument()
      expect(screen.getByText('results.kennelliitto.failure count')).toBeInTheDocument()
      expect(screen.getByText('Koira dog-11 (REG-dog-11): Koiran nimi ei täsmää.')).toBeInTheDocument()
    })

    it('sends the unchanged results too when asked to', async () => {
      vi.mocked(previewKennelliittoResults).mockResolvedValueOnce({
        blockers: [],
        dogs: [dogReport('run-1', 'unchanged')],
      })
      vi.mocked(sendKennelliittoResults).mockClear()
      const { user } = await openSend()
      const dialog = within(screen.getByRole('dialog'))
      expect(dialog.getByRole('button', { name: 'results.kennelliitto.send' })).toBeDisabled()

      await user.click(dialog.getByRole('checkbox', { name: 'results.kennelliitto.force' }))
      await user.click(dialog.getByRole('button', { name: 'results.kennelliitto.send' }))
      await flushPromises()

      expect(sendKennelliittoResults).toHaveBeenLastCalledWith(
        'test1',
        ['run-1'],
        { force: true, switchRegNos: [] },
        expect.anything()
      )
    })

    describe('dogs Kennelliitto knows by another number (KOE-1653)', () => {
      const chip = '981098106889342'
      const known = (id: string, foundBy: 'microchip' | 'name', rfid: string) => ({
        ...dogReport(id, 'ready'),
        kcDog: { breedCode: '121', foundBy, name: `Koira ${id}`, regNo: `FI-${id}`, rfid },
      })
      const preview = {
        blockers: [],
        dogs: [known('run-1', 'microchip', chip), known('run-2', 'name', ''), dogReport('dog-3', 'ready')],
      }
      const openChoices = async () => {
        vi.mocked(previewKennelliittoResults).mockResolvedValueOnce(preview)
        vi.mocked(sendKennelliittoResults).mockClear()
        const rendered = await renderSection(eventWithStaticDates, {
          'run-1': { dog: { ...registrationsToEventWithStations[0].dog, rfid: chip } },
        })
        await rendered.user.click(sendButton())
        await flushPromises()
        await rendered.user.click(
          within(screen.getByRole('dialog')).getByRole('button', { name: 'results.kennelliitto.send' })
        )
        return rendered
      }
      const confirmButton = () =>
        within(screen.getByRole('dialog')).getByRole('button', { name: 'results.kennelliitto.regNo.confirm' })

      it('counts them apart from the dogs sent as they are', async () => {
        vi.mocked(previewKennelliittoResults).mockResolvedValueOnce(preview)

        await openSend()

        expect(screen.getByText('results.kennelliitto.summary.ready count')).toBeInTheDocument()
        expect(screen.getByText('results.kennelliitto.summary.kcRegNo count')).toBeInTheDocument()
      })

      it('asks about all of them in one view, choosing Kennelliitto’s number only where the microchip is the same', async () => {
        await openChoices()

        const first = screen.getByRole('radiogroup', { name: 'Koira run-1 (REG-run-1)' })
        const second = screen.getByRole('radiogroup', { name: 'Koira run-2 (REG-run-2)' })
        expect(within(first).getByRole('radio', { name: /regNo.choice.switch/ })).toBeChecked()
        expect(
          within(second)
            .getAllByRole('radio')
            .filter((radio) => radio instanceof HTMLInputElement && radio.checked)
        ).toEqual([])
        // A dog found by its name is offered no adding as a new one: Kennelliitto refuses a dog of the same name.
        expect(within(second).getAllByRole('radio')).toHaveLength(2)
        expect(confirmButton()).toBeDisabled()
        expect(sendKennelliittoResults).not.toHaveBeenCalled()
      })

      it('sends the dogs as they are and the ones decided about, with the choices, leaving out the ones left out', async () => {
        const { user } = await openChoices()

        await user.click(
          within(screen.getByRole('radiogroup', { name: 'Koira run-2 (REG-run-2)' })).getByRole('radio', {
            name: 'results.kennelliitto.regNo.choice.leave',
          })
        )
        await user.click(confirmButton())
        await flushPromises()

        expect(sendKennelliittoResults).toHaveBeenCalledWith(
          'test1',
          ['run-1', 'dog-3'],
          { force: false, switchRegNos: ['run-1'] },
          expect.anything()
        )
      })

      it('takes Kennelliitto’s number for a dog found by its name when chosen so', async () => {
        const { user } = await openChoices()

        await user.click(
          within(screen.getByRole('radiogroup', { name: 'Koira run-2 (REG-run-2)' })).getByRole('radio', {
            name: /regNo.choice.switch/,
          })
        )
        await user.click(confirmButton())
        await flushPromises()

        expect(sendKennelliittoResults).toHaveBeenCalledWith(
          'test1',
          ['run-1', 'run-2', 'dog-3'],
          { force: false, switchRegNos: ['run-1', 'run-2'] },
          expect.anything()
        )
      })

      it('goes back to the preview changing and sending nothing', async () => {
        const { user } = await openChoices()

        await user.click(
          within(screen.getByRole('dialog')).getByRole('button', { name: 'results.kennelliitto.regNo.back' })
        )

        expect(screen.getByText('results.kennelliitto.confirm')).toBeInTheDocument()
        expect(sendKennelliittoResults).not.toHaveBeenCalled()
      })
    })

    it('reads the state from the server instead of reporting a failure when the answer never came', async () => {
      vi.mocked(previewKennelliittoResults).mockResolvedValueOnce({ blockers: [], dogs: [dogReport('run-1', 'ready')] })
      vi.mocked(sendKennelliittoResults).mockRejectedValueOnce(new Error('Network Error'))
      const { store, user } = await openSend()

      await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'results.kennelliitto.send' }))
      await flushPromises()

      // The list is the server's now (the mock holds none for this trial), not what the page believed.
      const registrations = await store.get(adminEventRegistrationsAtom('test1'))
      expect(registrations.some((registration) => registration.id === 'run-1')).toBe(false)
      expect(screen.getByText('results.kennelliitto.interrupted')).toBeInTheDocument()
      expect(screen.queryByText('results.kennelliitto.failure count')).not.toBeInTheDocument()
    })

    it('says the server failed, not the connection, when the server answered with an error (KOE-1140)', async () => {
      vi.mocked(previewKennelliittoResults).mockResolvedValueOnce({ blockers: [], dogs: [dogReport('run-1', 'ready')] })
      vi.mocked(sendKennelliittoResults).mockRejectedValueOnce(
        new APIError(new Response(null, { status: 500 }), { message: 'Internal Server Error' })
      )
      const { user } = await openSend()

      await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'results.kennelliitto.send' }))
      await flushPromises()

      expect(screen.getByText('results.kennelliitto.serverError status')).toBeInTheDocument()
      expect(screen.queryByText('results.kennelliitto.interrupted')).not.toBeInTheDocument()
    })
  })

  describe('the answers of a sending', () => {
    const sendBoth = async () => {
      vi.mocked(previewKennelliittoResults).mockResolvedValueOnce({
        blockers: [],
        dogs: [dogReport('run-1', 'ready'), dogReport('run-2', 'ready')],
      })
      const rendered = await renderSection()
      await rendered.user.click(sendButton())
      await flushPromises()
      await rendered.user.click(
        within(screen.getByRole('dialog')).getByRole('button', { name: 'results.kennelliitto.send' })
      )
      await flushPromises()
      await flushPromises()
      return rendered
    }
    const sent = (id: string) => ({ id, name: `Koira ${id}`, outcome: 'sent' as const, regNo: `REG-${id}` })

    it('counts a dog that was sent at once, from the answer, and offers the hand-over', async () => {
      vi.mocked(sendKennelliittoResults).mockResolvedValueOnce({
        blockers: [],
        notAttempted: [],
        patches: [
          {
            id: 'run-1',
            kcResult: {
              at: noon.toISOString(),
              by: 'Sihteeri',
              payloadHash: 'h',
              resultVersion: noon.toISOString(),
              status: 'sent',
            },
          },
        ],
        reports: [sent('run-1'), sent('run-2')],
      })

      const { store, user } = await sendBoth()
      await user.click(screen.getByRole('button', { name: 'results.kennelliitto.close' }))
      await flushPromises()

      const stored = await store.get(adminEventRegistrationsAtom('test1'))
      expect(stored.find((registration) => registration.id === 'run-1')?.kcResult?.status).toBe('sent')
      expect(handOverButton()).toBeInTheDocument()
    })

    it('asks again for the dogs a request had no time for, once it got somewhere', async () => {
      vi.mocked(sendKennelliittoResults)
        .mockResolvedValueOnce({ blockers: [], notAttempted: ['run-2'], patches: [], reports: [sent('run-1')] })
        .mockResolvedValueOnce({ blockers: [], notAttempted: [], patches: [], reports: [sent('run-2')] })
      vi.mocked(sendKennelliittoResults).mockClear()

      await sendBoth()

      expect(sendKennelliittoResults).toHaveBeenCalledTimes(2)
      expect(sendKennelliittoResults).toHaveBeenNthCalledWith(
        2,
        'test1',
        ['run-2'],
        { force: false, switchRegNos: [] },
        expect.anything()
      )
      expect(screen.getByText('results.kennelliitto.success count')).toBeInTheDocument()
      expect(screen.queryByText('results.kennelliitto.notAttempted count')).not.toBeInTheDocument()
    })

    it('does not ask again when the request got nowhere, and says which dogs were left', async () => {
      vi.mocked(sendKennelliittoResults).mockClear()
      vi.mocked(sendKennelliittoResults).mockResolvedValueOnce({
        blockers: [],
        notAttempted: ['run-1', 'run-2'],
        patches: [],
        reports: [],
      })

      await sendBoth()

      expect(sendKennelliittoResults).toHaveBeenCalledTimes(1)
      expect(screen.getByText('results.kennelliitto.notAttempted count')).toBeInTheDocument()
    })

    it('says what stopped the trial when the server refuses it as blocked, and sends no more', async () => {
      vi.mocked(sendKennelliittoResults).mockRejectedValueOnce(
        new APIError(new Response(null, { status: 409 }), { blockers: [{ code: 'handedOver' }], error: 'blocked' })
      )

      await sendBoth()

      expect(screen.getByText('results.kennelliitto.blocker.handedOver detail')).toBeInTheDocument()
      expect(screen.queryByText('results.kennelliitto.interrupted')).not.toBeInTheDocument()
    })

    it('says which dogs it did not send, with where they stood', async () => {
      vi.mocked(sendKennelliittoResults).mockResolvedValueOnce({
        blockers: [],
        notAttempted: [],
        patches: [],
        reports: [
          sent('run-1'),
          {
            dogStatus: 'blocked',
            id: 'run-2',
            name: 'Koira run-2',
            outcome: 'skipped',
            problems: [{ code: 'noJudge' }],
            regNo: 'REG-run-2',
          },
        ],
      })

      await sendBoth()

      expect(screen.getByText('results.kennelliitto.skipped count')).toBeInTheDocument()
      expect(
        screen.getByText('Koira run-2 (REG-run-2): results.kennelliitto.problem.noJudge detail')
      ).toBeInTheDocument()
    })
  })

  describe('what a hand-over answers', () => {
    const openHandOver = async () => {
      const { user } = await renderSection(eventWithStaticDates, { 'run-1': { kcResult: sentOk } })
      await user.click(handOverButton())
      await flushPromises()
      const dialog = within(screen.getByRole('dialog'))
      await user.click(dialog.getByRole('button', { name: 'results.kennelliitto.handOverButton' }))
      await flushPromises()
      return { dialog, user }
    }
    const refusal = (status: number, body: ConstructorParameters<typeof APIError>[1]) =>
      vi.mocked(handOverKennelliittoResults).mockRejectedValueOnce(new APIError(new Response(null, { status }), body))

    it('says what the hand-over means before it is made', async () => {
      const { user } = await renderSection(
        { ...eventWithStaticDates, eventType: 'NOWT' },
        { 'run-1': { kcResult: sentOk } }
      )

      await user.click(handOverButton())
      await flushPromises()

      // The hand-over is where the secretary is told they can no longer edit, and, in a format that
      // awards certificates, that those still go to Omakoira by hand.
      expect(screen.getByText('results.kennelliitto.handOver.confirm')).toBeInTheDocument()
      expect(screen.getByText('results.kennelliitto.handOver.certificates')).toBeInTheDocument()
    })

    it('says nothing of certificates where the format awards none (KOE-1644)', async () => {
      const { user } = await renderSection(eventWithStaticDates, { 'run-1': { kcResult: sentOk } })

      await user.click(handOverButton())
      await flushPromises()

      expect(screen.getByText('results.kennelliitto.handOver.confirm')).toBeInTheDocument()
      expect(screen.queryByText('results.kennelliitto.handOver.certificates')).not.toBeInTheDocument()
    })

    it('lists what stops the trial', async () => {
      refusal(409, { blockers: [{ code: 'stateNotWritable', detail: 'Valmistunut' }], error: 'blocked' })

      const { dialog } = await openHandOver()

      expect(dialog.getByText('results.kennelliitto.blocker.stateNotWritable detail')).toBeInTheDocument()
    })

    it('lists the results that have to be sent first', async () => {
      refusal(409, { dogs: [dogReport('run-2', 'ready')], error: 'unsentResults' })

      const { dialog } = await openHandOver()

      expect(dialog.getByText('results.kennelliitto.handOver.unsent')).toBeInTheDocument()
      expect(dialog.getByText('Koira run-2 (REG-run-2): results.kennelliitto.dogStatus.ready')).toBeInTheDocument()
    })

    it('gives Kennelliitto’s reasons when it refuses the hand-over', async () => {
      refusal(502, { error: 'kennelliittoRefused', status: 400, virheet: ['Tila ei kelpaa.'] })

      const { dialog } = await openHandOver()

      expect(dialog.getByText('results.kennelliitto.handOver.refused reasons')).toBeInTheDocument()
    })

    it('says it is not known whether it happened when Kennelliitto gave no reasons', async () => {
      refusal(502, { error: 'kennelliittoRefused', status: 0 })

      const { dialog } = await openHandOver()

      expect(dialog.getByText('results.kennelliitto.handOver.unknown')).toBeInTheDocument()
      expect(dialog.queryByText('results.kennelliitto.handOver.refused reasons')).not.toBeInTheDocument()
    })

    it('asks for the secretary’s word before handing over nothing, and then hands over', async () => {
      refusal(409, { error: 'nothingSent' })

      const { dialog, user } = await openHandOver()
      expect(dialog.getByText('results.kennelliitto.handOver.nothingSent')).toBeInTheDocument()
      expect(dialog.getByRole('button', { name: 'results.kennelliitto.handOverButton' })).toBeDisabled()

      await user.click(dialog.getByRole('checkbox'))
      await user.click(dialog.getByRole('button', { name: 'results.kennelliitto.handOverButton' }))
      await flushPromises()

      expect(handOverKennelliittoResults).toHaveBeenLastCalledWith('test1', true, expect.anything())
    })

    it('lists the dogs that stay out and hands over once the secretary accepts them', async () => {
      vi.mocked(handOverKennelliittoResults).mockClear()
      refusal(409, { dogs: [dogReport('run-2', 'blocked', [{ code: 'noResult' }])], error: 'confirmationNeeded' })

      const { dialog, user } = await openHandOver()
      expect(dialog.getByText('results.kennelliitto.handOver.leftOut')).toBeInTheDocument()
      expect(dialog.getByRole('button', { name: 'results.kennelliitto.handOverButton' })).toBeDisabled()

      await user.click(dialog.getByRole('checkbox'))
      await user.click(dialog.getByRole('button', { name: 'results.kennelliitto.handOverButton' }))
      await flushPromises()

      expect(handOverKennelliittoResults).toHaveBeenNthCalledWith(1, 'test1', false, expect.anything())
      expect(handOverKennelliittoResults).toHaveBeenNthCalledWith(2, 'test1', true, expect.anything())
    })

    it('says it is done and closes when the trial is handed over', async () => {
      await openHandOver()

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      expect(screen.getByText('results.kennelliitto.handOver.done')).toBeInTheDocument()
    })
  })

  describe('handing over with the secretary’s word', () => {
    const openNothingSent = async () => {
      vi.mocked(handOverKennelliittoResults).mockClear()
      vi.mocked(handOverKennelliittoResults).mockRejectedValueOnce(
        new APIError(new Response(null, { status: 409 }), { error: 'nothingSent' })
      )
      const { user } = await renderSection(eventWithStaticDates, { 'run-1': { kcResult: sentOk } })
      await user.click(handOverButton())
      await flushPromises()
      return { dialog: within(screen.getByRole('dialog')), user }
    }

    it('asks without the word first, and sends the word only after it has been given', async () => {
      const { dialog, user } = await openNothingSent()

      await user.click(dialog.getByRole('button', { name: 'results.kennelliitto.handOverButton' }))
      await flushPromises()
      expect(handOverKennelliittoResults).toHaveBeenCalledTimes(1)
      expect(handOverKennelliittoResults).toHaveBeenLastCalledWith('test1', false, expect.anything())

      await user.click(dialog.getByRole('checkbox'))
      await user.click(dialog.getByRole('button', { name: 'results.kennelliitto.handOverButton' }))
      await flushPromises()

      expect(handOverKennelliittoResults).toHaveBeenCalledTimes(2)
      expect(handOverKennelliittoResults).toHaveBeenLastCalledWith('test1', true, expect.anything())
    })

    it('does not carry the word over to the next time the dialog is opened', async () => {
      const { dialog, user } = await openNothingSent()
      await user.click(dialog.getByRole('button', { name: 'results.kennelliitto.handOverButton' }))
      await flushPromises()
      await user.click(dialog.getByRole('checkbox'))

      await user.click(dialog.getByRole('button', { name: 'cancel' }))
      await flushPromises()
      await user.click(handOverButton())
      await flushPromises()
      await user.click(
        within(screen.getByRole('dialog')).getByRole('button', { name: 'results.kennelliitto.handOverButton' })
      )
      await flushPromises()

      expect(handOverKennelliittoResults).toHaveBeenLastCalledWith('test1', false, expect.anything())
    })
  })

  describe('a trial handed to the chief judge', () => {
    it('says so, and offers neither sending nor hand-over', async () => {
      await renderSection(handedOver, { 'run-1': { kcResult: sentOk } })

      expect(screen.getByText('results.kennelliitto.blocker.handedOver')).toBeInTheDocument()
      expect(sendButton()).toBeDisabled()
      expect(screen.queryByRole('button', { name: 'results.kennelliitto.handOverButton' })).not.toBeInTheDocument()
    })

    it('leaves the read of the state to the event view, and asks it again on request', async () => {
      vi.mocked(previewKennelliittoResults).mockClear()
      const { refreshState, user } = await renderSection(handedOver)

      // The page reads the state once, open panel or not; the section adds no second read.
      expect(previewKennelliittoResults).not.toHaveBeenCalled()

      await user.click(screen.getByRole('button', { name: 'results.kennelliitto.refreshState' }))
      await flushPromises()

      expect(refreshState).toHaveBeenCalledTimes(1)
    })

    it('opens again when the judge has sent the trial back', async () => {
      // The event view's read writes Kennelliitto's state onto the event, which arrives over the socket as a patch.
      const { store } = await renderSection(handedOver)
      expect(sendButton()).toBeDisabled()

      await act(() =>
        store.set(adminEventsAtom, [{ ...handedOver, kcState: { code: 754, name: 'Hyväksytty', readAt: noon } }])
      )
      await flushPromises()

      expect(sendButton()).toBeEnabled()
      expect(screen.queryByText('results.kennelliitto.blocker.handedOver')).not.toBeInTheDocument()
    })
  })

  describe('the dogs in the order of the secretary’s list (KOE-1652)', () => {
    // The drawn numbers put run-2 first on the list, though the dogs are held run-1 first.
    const drawn: Record<string, Partial<Registration>> = {
      'run-1': { startGroup: { date: RESULTS_EVENT_DAY, key: 'ALO-AP', number: 2, time: 'ap' } },
      'run-2': { startGroup: { date: RESULTS_EVENT_DAY, key: 'ALO-AP', number: 1, time: 'ap' } },
    }
    /** The lines of the list under the alert that says `heading`. */
    const listUnder = (heading: string) => {
      const alert = screen.getAllByRole('alert').find((element) => within(element).queryByText(heading))
      if (!alert) throw new Error(`no alert with ${heading}`)
      return within(alert)
        .getAllByRole('listitem')
        .map((item) => item.textContent)
    }
    const sent = (id: string) => ({ id, name: `Koira ${id}`, outcome: 'sent' as const, regNo: `REG-${id}` })

    it('lists the dogs of the preview as the list has them, a dog not on it last', async () => {
      vi.mocked(previewKennelliittoResults).mockResolvedValueOnce({
        blockers: [],
        dogs: [
          dogReport('run-1', 'blocked', [{ code: 'noJudge' }]),
          dogReport('gone', 'blocked', [{ code: 'noJudge' }]),
          dogReport('run-2', 'blocked', [{ code: 'noJudge' }]),
        ],
      })
      const { user } = await renderSection(eventWithStaticDates, drawn)

      await user.click(sendButton())
      await flushPromises()

      const items = within(screen.getByRole('dialog'))
        .getAllByRole('listitem')
        .map((item) => item.textContent)
      expect(items).toEqual([
        'Koira run-2 (REG-run-2): results.kennelliitto.problem.noJudge detail',
        'Koira run-1 (REG-run-1): results.kennelliitto.problem.noJudge detail',
        'Koira gone (REG-gone): results.kennelliitto.problem.noJudge detail',
      ])
    })

    it('lists the dogs saved one under another, as the list has them', async () => {
      vi.mocked(previewKennelliittoResults).mockResolvedValueOnce({
        blockers: [],
        dogs: [dogReport('run-1', 'ready'), dogReport('run-2', 'ready')],
      })
      vi.mocked(sendKennelliittoResults).mockResolvedValueOnce({
        blockers: [],
        notAttempted: [],
        patches: [],
        reports: [sent('run-1'), sent('run-2')],
      })
      const { user } = await renderSection(eventWithStaticDates, drawn)

      await user.click(sendButton())
      await flushPromises()
      await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'results.kennelliitto.send' }))
      await flushPromises()
      await flushPromises()

      expect(listUnder('results.kennelliitto.success count')).toEqual([
        'Koira run-2 (REG-run-2)',
        'Koira run-1 (REG-run-1)',
      ])
    })

    it('lists the results the hand-over wants sent first as the list has them', async () => {
      vi.mocked(handOverKennelliittoResults).mockRejectedValueOnce(
        new APIError(new Response(null, { status: 409 }), {
          dogs: [dogReport('run-1', 'ready'), dogReport('run-2', 'ready')],
          error: 'unsentResults',
        })
      )
      const { user } = await renderSection(eventWithStaticDates, {
        'run-1': { ...drawn['run-1'], kcResult: sentOk },
        'run-2': drawn['run-2'],
      })

      await user.click(handOverButton())
      await flushPromises()
      await user.click(
        within(screen.getByRole('dialog')).getByRole('button', { name: 'results.kennelliitto.handOverButton' })
      )
      await flushPromises()

      expect(listUnder('results.kennelliitto.handOver.unsent')).toEqual([
        'Koira run-2 (REG-run-2): results.kennelliitto.dogStatus.ready',
        'Koira run-1 (REG-run-1): results.kennelliitto.dogStatus.ready',
      ])
    })
  })
})
