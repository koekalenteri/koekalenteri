import type { ConfirmedEvent } from '@/types'
import { screen, within } from '@testing-library/react'
import { ConfirmProvider } from 'material-ui-confirm'
import { enqueueSnackbar } from 'notistack'
import { eventWithStaticDates } from '@/__mockData__/events'
import { renderWithUserEvents } from '@/test-utils/utils'
import ResultsPublishing from './ResultsPublishing'

vi.mock('notistack', () => ({
  enqueueSnackbar: vi.fn(),
}))

// A tolling aptitude trial (NOU) has no classes; its start list is out and the dogs have run.
const classless: ConfirmedEvent = { ...eventWithStaticDates, startListPublished: true, state: 'ended' }

const renderSection = (event: ConfirmedEvent, onSetResultsPublished = vi.fn().mockResolvedValue(undefined)) => ({
  onSetResultsPublished,
  ...renderWithUserEvents(
    <ConfirmProvider>
      <ResultsPublishing event={event} eventStarted onSetResultsPublished={onSetResultsPublished} />
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

  it('waits for the start list of a classless event', () => {
    renderSection({ ...oneDay, startListPublished: false })

    expect(screen.getByText('eventManagement.results.startListRequired')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'eventManagement.results.publish' })).toBeDisabled()
  })

  /**
   * A class running on two days has a row for each, published on its own: the first day's results go
   * out that evening and the second day's stay hidden while they are entered (KOE-1510).
   */
  describe('on a two-day trial', () => {
    const twoDays: ConfirmedEvent = {
      ...classless,
      classes: [
        { class: 'ALO', date: new Date('2021-02-10') },
        { class: 'ALO', date: new Date('2021-02-11') },
      ],
      resultsPublished: { ALO: [new Date('2021-02-10')] },
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
