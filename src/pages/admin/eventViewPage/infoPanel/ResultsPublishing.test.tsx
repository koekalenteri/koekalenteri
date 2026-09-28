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
  // KOE-1464: the section drew one row per class, so a classless event had no button at all.
  it('offers publishing the results of a classless event as one row', async () => {
    const { onSetResultsPublished, user } = renderSection(classless)

    expect(screen.getByText('NOU')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'eventManagement.results.publish' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('eventManagement.results.confirmEvent')).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'eventManagement.results.publish' }))

    expect(onSetResultsPublished).toHaveBeenCalledWith(undefined, true)
  })

  it('hides the published results of a classless event', async () => {
    const { onSetResultsPublished, user } = renderSection({ ...classless, resultsPublished: true })

    expect(screen.getByText('eventManagement.results.published')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'eventManagement.results.hide' }))

    expect(onSetResultsPublished).toHaveBeenCalledWith(undefined, false)
  })

  it('names the class when publishing the results of one', async () => {
    const withClass: ConfirmedEvent = { ...classless, classes: [{ class: 'ALO', date: classless.startDate }] }
    const { onSetResultsPublished, user } = renderSection(withClass)

    await user.click(screen.getByRole('button', { name: 'eventManagement.results.publish' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('eventManagement.results.confirm eventClass')).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'eventManagement.results.publish' }))

    expect(onSetResultsPublished).toHaveBeenCalledWith('ALO', true)
    expect(enqueueSnackbar).toHaveBeenCalledWith('eventManagement.results.publishedSnack eventClass', {
      variant: 'success',
    })
  })

  it('waits for the start list of a classless event', () => {
    renderSection({ ...classless, startListPublished: false })

    expect(screen.getByText('eventManagement.results.startListRequired')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'eventManagement.results.publish' })).toBeDisabled()
  })
})
