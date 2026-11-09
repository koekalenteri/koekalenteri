import { render, screen } from '@testing-library/react'
import { flushPromises, renderWithUserEvents } from '@/test-utils/utils'
import { TeamEntryInfo } from './TeamEntryInfo'

// KOE-1721: the registrant names the team the dog runs in, and whether it is the club's first team.
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
    expect(onChange).toHaveBeenLastCalledWith({ teamEntry: { name: 'Golden Ring' } })

    await user.clear(screen.getByRole('textbox', { name: 'registration.teamEntryName' }))
    await flushPromises()
    expect(onChange).toHaveBeenLastCalledWith({ teamEntry: undefined })
  })

  it('marks the first team only once there is a name, and keeps the name with the mark', async () => {
    const onChange = vi.fn()
    const { user, rerender } = renderSection({ onChange })

    expect(screen.getByRole('checkbox', { name: 'registration.teamEntryPrimary' })).toBeDisabled()

    rerender(<TeamEntryInfo open onChange={onChange} teamEntry={{ name: 'Golden Ring' }} />)
    await user.click(screen.getByRole('checkbox', { name: 'registration.teamEntryPrimary' }))
    expect(onChange).toHaveBeenLastCalledWith({ teamEntry: { name: 'Golden Ring', primary: true } })

    rerender(<TeamEntryInfo open onChange={onChange} teamEntry={{ name: 'Golden Ring', primary: true }} />)
    await user.click(screen.getByRole('checkbox', { name: 'registration.teamEntryPrimary' }))
    expect(onChange).toHaveBeenLastCalledWith({ teamEntry: { name: 'Golden Ring' } })
  })

  it('shows the error the form found, and nothing can be changed while the section is locked', () => {
    render(
      <TeamEntryInfo
        disabled
        error
        helperText="liian pitkä"
        onChange={vi.fn()}
        open
        teamEntry={{ name: 'Golden Ring', primary: true }}
      />
    )

    expect(screen.getAllByText('liian pitkä')).not.toHaveLength(0)
    expect(screen.getByRole('textbox', { name: 'registration.teamEntryName' })).toBeDisabled()
    expect(screen.getByRole('checkbox', { name: 'registration.teamEntryPrimary' })).toBeDisabled()
  })
})
