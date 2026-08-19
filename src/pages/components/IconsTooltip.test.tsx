import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { IconsTooltip } from './IconsTooltip'

describe('IconsTooltip', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('does not render a tooltip when icons is an empty fragment', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })

    render(
      <IconsTooltip icons={<></>} enterDelay={0}>
        <button type="button">target</button>
      </IconsTooltip>
    )

    await user.hover(screen.getByRole('button', { name: 'target' }))
    act(() => {
      vi.runOnlyPendingTimers()
    })

    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
  })

  it('renders a tooltip when icons has content', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })

    render(
      <IconsTooltip icons={<div>IconText</div>} enterDelay={0}>
        <button type="button">target</button>
      </IconsTooltip>
    )

    await user.hover(screen.getByRole('button', { name: 'target' }))
    act(() => {
      vi.runOnlyPendingTimers()
    })

    expect(await screen.findByText('IconText')).toBeInTheDocument()
  })
})
