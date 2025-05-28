import { screen } from '@testing-library/react'

import { renderWithUserEvents } from '../../../../../test-utils/utils'

import GroupColorTooltip from './GroupColorTooltip'

describe('GroupColorTooltip', () => {
  const mockDate = new Date('2023-01-01')
  const mockSelected = [{ date: mockDate, time: 'ap' as const }]

  it('renders', async () => {
    const { container } = renderWithUserEvents(
      <GroupColorTooltip selected={mockSelected}>
        <div data-testid="child-element">Test Child</div>
      </GroupColorTooltip>
    )
    expect(container).toMatchSnapshot()
  })

  it('renders the child element', () => {
    renderWithUserEvents(
      <GroupColorTooltip selected={mockSelected}>
        <div data-testid="child-element">Test Child</div>
      </GroupColorTooltip>
    )

    expect(screen.getByTestId('child-element')).toBeInTheDocument()
    expect(screen.getByText('Test Child')).toBeInTheDocument()
  })

  it('creates tooltip with correct title for a single date/time', async () => {
    const { user } = renderWithUserEvents(
      <GroupColorTooltip selected={mockSelected}>
        <div data-testid="child-element">Test Child</div>
      </GroupColorTooltip>
    )

    // Hover over the child element to show the tooltip
    await user.hover(screen.getByTestId('child-element'))

    // Check that the tooltip is shown with the correct text
    expect(screen.getByLabelText('Sopivat ryhmät: eeeeee registration.time.ap')).toBeInTheDocument()
  })

  it('creates tooltip with correct title for multiple dates/times', async () => {
    const multipleSelected = [
      { date: mockDate, time: 'ap' as const },
      { date: mockDate, time: 'ip' as const },
    ]

    const { user } = renderWithUserEvents(
      <GroupColorTooltip selected={multipleSelected}>
        <div data-testid="child-element">Test Child</div>
      </GroupColorTooltip>
    )

    // Hover over the child element to show the tooltip
    await user.hover(screen.getByTestId('child-element'))

    // Check that the tooltip is shown with the correct text
    expect(
      screen.getByLabelText('Sopivat ryhmät: eeeeee registration.time.ap, eeeeee registration.time.ip')
    ).toBeInTheDocument()
  })

  it('handles empty selected array', () => {
    renderWithUserEvents(
      <GroupColorTooltip selected={[]}>
        <div data-testid="child-element">Test Child</div>
      </GroupColorTooltip>
    )

    // The component should still render the child
    expect(screen.getByTestId('child-element')).toBeInTheDocument()
  })
})
