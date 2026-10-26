import type { ResultsParticipant } from '@/lib/publishing'
import type { ConfirmedEvent, DayKey, JsonRegistration } from '@/types'
import { act, screen, within } from '@testing-library/react'
import { ConfirmProvider } from 'material-ui-confirm'
import { enqueueSnackbar } from 'notistack'
import { eventWithStaticDates } from '@/__mockData__/events'
import { APIError } from '@/api/http'
import { groupParticipantsByClass } from '@/lib/registration'
import { renderWithUserEvents } from '@/test-utils/utils'
import ResultsPublishing from './ResultsPublishing'

vi.mock('notistack', () => ({
  enqueueSnackbar: vi.fn(),
}))

// A tolling aptitude trial (NOU) has no classes; its start list is out and the dogs have run.
const classless: ConfirmedEvent = { ...eventWithStaticDates, startListPublished: true, state: 'ended' }

/** An entry as the panel's grouping and the results rule read it. */
type Dog = ResultsParticipant & Pick<JsonRegistration, 'cancelled' | 'class' | 'eventType'>

/** A dog placed on the day, with a result entered. */
const dog = (date: DayKey, eventClass?: 'ALO' | 'AVO'): Dog => ({
  class: eventClass,
  eventResult: { result: 'NOU1', updatedAt: '2021-02-10T15:00:00.000Z', updatedBy: 'Sihteeri' },
  eventType: 'NOU',
  group: { date, key: `${date}-ap`, number: 1 },
})

// A result entered on each day, for the classless trial and for ALO alike.
const scoredDays = [dog('2021-02-10'), dog('2021-02-11'), dog('2021-02-10', 'ALO'), dog('2021-02-11', 'ALO')]

const renderSection = (
  event: ConfirmedEvent,
  onSetResultsPublished = vi.fn().mockResolvedValue(undefined),
  registrations: readonly Dog[] = scoredDays
) => ({
  onSetResultsPublished,
  ...renderWithUserEvents(
    <ConfirmProvider>
      <ResultsPublishing
        event={event}
        eventStarted
        onSetResultsPublished={onSetResultsPublished}
        selectedByClass={groupParticipantsByClass(registrations)}
      />
    </ConfirmProvider>
  ),
})

describe('ResultsPublishing', () => {
  // One day, so one row: a day that is the whole trial needs no name of its own.
  const oneDay: ConfirmedEvent = { ...classless, endDate: classless.startDate }

  // KOE-1464: the section drew one row per class, so a classless event had no button at all.
  it('offers publishing the results of a classless event as one row', async () => {
    const { onSetResultsPublished, user } = renderSection(oneDay)

    expect(screen.getByText('NOU')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'eventManagement.results.publish' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('eventManagement.results.confirmEvent day, eventClass')).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'eventManagement.results.publish' }))

    expect(onSetResultsPublished).toHaveBeenCalledWith(undefined, '2021-02-10', true)
  })

  it('hides the published results of a classless event', async () => {
    const { onSetResultsPublished, user } = renderSection({ ...oneDay, resultsPublished: true })

    expect(screen.getByText('eventManagement.results.published')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'eventManagement.results.hide' }))

    expect(onSetResultsPublished).toHaveBeenCalledWith(undefined, '2021-02-10', false)
  })

  it('names the class when publishing the results of one', async () => {
    const withClass: ConfirmedEvent = { ...oneDay, classes: [{ class: 'ALO', date: classless.startDate }] }
    const { onSetResultsPublished, user } = renderSection(withClass)

    await user.click(screen.getByRole('button', { name: 'eventManagement.results.publish' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('eventManagement.results.confirm day, eventClass')).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'eventManagement.results.publish' }))

    expect(onSetResultsPublished).toHaveBeenCalledWith('ALO', '2021-02-10', true)
    expect(enqueueSnackbar).toHaveBeenCalledWith('eventManagement.results.publishedSnack day, eventClass', {
      variant: 'success',
    })
  })

  it('always lets published results be hidden, though the start list has gone (KOE-1510)', async () => {
    // Publishing waits on the list; hiding never does, here as on the server.
    const { onSetResultsPublished, user } = renderSection({
      ...oneDay,
      resultsPublished: true,
      startListPublished: false,
    })

    const hide = screen.getByRole('button', { name: 'eventManagement.results.hide' })
    expect(hide).toBeEnabled()
    await user.click(hide)

    expect(onSetResultsPublished).toHaveBeenCalledWith(undefined, '2021-02-10', false)
  })

  it('keeps a row button disabled while its request is on its way (KOE-1510)', async () => {
    let answer: (value: unknown) => void = () => {}
    const pending = vi.fn(() => new Promise((resolve) => (answer = resolve)))
    const { user } = renderSection({ ...oneDay, resultsPublished: true }, pending)

    const hide = screen.getByRole('button', { name: 'eventManagement.results.hide' })
    await user.click(hide)
    expect(hide).toBeDisabled()

    await act(async () => answer(undefined))
    expect(hide).toBeEnabled()
    expect(pending).toHaveBeenCalledTimes(1)
  })

  it('says the results changed meanwhile when the server kept losing the race (KOE-1510)', async () => {
    const refused = vi
      .fn()
      .mockRejectedValue(new APIError(new Response(null, { status: 409 }), { error: 'resultsPublishedChanged' }))
    const { user } = renderSection({ ...oneDay, resultsPublished: true }, refused)

    await user.click(screen.getByRole('button', { name: 'eventManagement.results.hide' }))

    expect(enqueueSnackbar).toHaveBeenCalledWith('eventManagement.results.changedMeanwhile', expect.anything())
  })

  it('says only that the save failed for any other failure', async () => {
    const { user } = renderSection(
      { ...oneDay, resultsPublished: true },
      vi.fn().mockRejectedValue(new Error('offline'))
    )

    await user.click(screen.getByRole('button', { name: 'eventManagement.results.hide' }))

    expect(enqueueSnackbar).toHaveBeenCalledWith('eventManagement.results.saveFailed', expect.anything())
  })

  it('waits for the start list of a classless event', () => {
    renderSection({ ...oneDay, startListPublished: false })

    expect(screen.getByText('eventManagement.results.startListRequired')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'eventManagement.results.publish' })).toBeDisabled()
  })

  // KOE-1642: the button stood live on a trial with every result field still empty.
  it('keeps the publish disabled while no result is entered, and says so', () => {
    // The dog is placed on the day, its result fields still empty as in the report.
    renderSection(oneDay, undefined, [{ ...dog('2021-02-10'), eventResult: undefined }])

    expect(screen.getByText('eventManagement.results.noResults')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'eventManagement.results.publish' })).toBeDisabled()
  })

  it('does not count the result of a dog that has cancelled', () => {
    const cancelled: Dog = {
      ...dog('2021-02-10'),
      cancelled: true,
      group: { date: '2021-02-10', key: 'cancelled', number: 1 },
    }
    renderSection(oneDay, undefined, [cancelled])

    expect(screen.getByText('eventManagement.results.noResults')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'eventManagement.results.publish' })).toBeDisabled()
  })

  it("reads each class's own results: AVO's do not open ALO", () => {
    const twoClasses: ConfirmedEvent = {
      ...oneDay,
      classes: [
        { class: 'ALO', date: '2021-02-10' },
        { class: 'AVO', date: '2021-02-10' },
      ],
    }
    renderSection(twoClasses, undefined, [dog('2021-02-10', 'AVO')])

    const [alo, avo] = screen.getAllByRole('row')
    expect(within(alo).getByText('ALO')).toBeInTheDocument()
    expect(within(alo).getByText('eventManagement.results.noResults')).toBeInTheDocument()
    expect(within(alo).getByRole('button', { name: 'eventManagement.results.publish' })).toBeDisabled()
    expect(within(avo).getByRole('button', { name: 'eventManagement.results.publish' })).toBeEnabled()
  })

  it('names only the missing start list when that is what stands in the way', () => {
    renderSection({ ...oneDay, startListPublished: false }, undefined, [])

    expect(screen.getByText('eventManagement.results.startListRequired')).toBeInTheDocument()
    expect(screen.queryByText('eventManagement.results.noResults')).not.toBeInTheDocument()
  })

  it('lets results that went out be hidden though none is entered any longer', () => {
    renderSection({ ...oneDay, resultsPublished: true }, undefined, [])

    expect(screen.getByRole('button', { name: 'eventManagement.results.hide' })).toBeEnabled()
    expect(screen.queryByText('eventManagement.results.noResults')).not.toBeInTheDocument()
  })

  /**
   * A class running on two days has a row for each, published on its own: the first day's results go
   * out that evening and the second day's stay hidden while they are entered (KOE-1510).
   */
  describe('on a two-day trial', () => {
    const twoDays: ConfirmedEvent = {
      ...classless,
      classes: [
        { class: 'ALO', date: '2021-02-10' },
        { class: 'ALO', date: '2021-02-11' },
      ],
      resultsPublished: { ALO: ['2021-02-10'] },
    }
    const dayRows = () => screen.getAllByRole('row')

    afterEach(() => {
      vi.useRealTimers()
    })

    it('publishes and hides each day of a class on its own', async () => {
      const { onSetResultsPublished, user } = renderSection(twoDays)

      const [first, second] = dayRows()
      expect(within(first).getByText('eventManagement.results.published')).toBeInTheDocument()
      expect(within(second).queryByText('eventManagement.results.published')).not.toBeInTheDocument()

      await user.click(within(second).getByRole('button', { name: 'eventManagement.results.publish' }))
      const dialog = await screen.findByRole('dialog')
      expect(within(dialog).getByText('eventManagement.results.confirmDay day, eventClass')).toBeInTheDocument()
      await user.click(within(dialog).getByRole('button', { name: 'eventManagement.results.publish' }))
      expect(onSetResultsPublished).toHaveBeenCalledWith('ALO', '2021-02-11', true)

      // The dialog leaves the page hidden from the accessibility tree until its exit transition ends.
      await user.click(await within(first).findByRole('button', { name: 'eventManagement.results.hide' }))
      expect(onSetResultsPublished).toHaveBeenCalledWith('ALO', '2021-02-10', false)
      expect(enqueueSnackbar).toHaveBeenCalledWith('eventManagement.results.hiddenDay day, eventClass', {
        variant: 'success',
      })
    })

    it('keeps the publish of a day without a result disabled, though the other day has one (KOE-1642)', () => {
      renderSection({ ...twoDays, resultsPublished: undefined }, undefined, [dog('2021-02-11', 'ALO')])

      const [first, second] = dayRows()
      expect(within(first).getByRole('button', { name: 'eventManagement.results.publish' })).toBeDisabled()
      expect(within(first).getByText('eventManagement.results.noResults')).toBeInTheDocument()
      expect(within(second).getByRole('button', { name: 'eventManagement.results.publish' })).toBeEnabled()
    })

    it('keeps the publish of a day that has not begun disabled, as the server would refuse it', () => {
      // The evening of the first day: the second day has not begun.
      vi.useFakeTimers({ now: new Date('2021-02-10T18:00:00+02:00'), toFake: ['Date'] })
      renderSection({ ...twoDays, resultsPublished: undefined })

      const [first, second] = dayRows()
      expect(within(first).getByRole('button', { name: 'eventManagement.results.publish' })).toBeEnabled()
      expect(within(second).getByRole('button', { name: 'eventManagement.results.publish' })).toBeDisabled()
    })
  })
})
