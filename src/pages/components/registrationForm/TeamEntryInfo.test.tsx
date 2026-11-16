import { render, screen } from '@testing-library/react'
import { flushPromises, renderWithUserEvents } from '@/test-utils/utils'
import { TeamEntryInfo } from './TeamEntryInfo'

// KOE-1721: the registrant names the team the dog runs in. KOE-1759: the name alone; the secretary
// marks a club's first team on the teams page.
describe('TeamEntryInfo', () => {
  beforeAll(() => vi.useFakeTimers())
  afterEach(() => vi.runOnlyPendingTimers())
  afterAll(() => vi.useRealTimers())

  const renderSection = (props: Partial<Parameters<typeof TeamEntryInfo>[0]> = {}) =>
    renderWithUserEvents(<TeamEntryInfo open onChange={vi.fn()} {...props} />, undefined, {
      advanceTimers: vi.advanceTimersByTime,
    })

  it('names the team as typed, and takes the team away once the name is cleared', async () => {
    const onChange = vi.fn()
    const { user } = renderSection({ onChange })

    await user.type(screen.getByRole('textbox', { name: 'registration.teamEntryName' }), 'Golden Ring')
    await flushPromises()
    expect(onChange).toHaveBeenLastCalledWith({ name: 'Golden Ring' })

    await user.clear(screen.getByRole('textbox', { name: 'registration.teamEntryName' }))
    await flushPromises()
    expect(onChange).toHaveBeenLastCalledWith(undefined)
  })

  // KOE-1759: an entry saved in 2.2.0 may still hold the first-team mark; the form neither shows it nor
  // writes it back.
  it('asks for the name alone, and leaves a stored first-team mark out of the team it names', async () => {
    const onChange = vi.fn()
    const stored = { name: 'Golden Ring', primary: true }
    const { user } = renderSection({ onChange, teamEntry: stored })

    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()

    await user.type(screen.getByRole('textbox', { name: 'registration.teamEntryName' }), ' 2')
    await flushPromises()
    expect(onChange).toHaveBeenLastCalledWith({ name: 'Golden Ring 2' })
  })

  it('shows the error the form found, and the name cannot be changed while the section is locked', () => {
    render(
      <TeamEntryInfo
        disabled
        error
        helperText="liian pitkä"
        onChange={vi.fn()}
        open
        teamEntry={{ name: 'Golden Ring' }}
      />
    )

    expect(screen.getAllByText('liian pitkä')).not.toHaveLength(0)
    expect(screen.getByRole('textbox', { name: 'registration.teamEntryName' })).toBeDisabled()
  })
})
