import { screen } from '@testing-library/react'
import { renderWithUserEvents } from '../../../../test-utils/utils'
import GroupHeader from './GroupHeader'

jest.mock('./GroupColors', () => ({
  __esModule: true,
  default: ({ available, selected, disableTooltip }: any) => (
    <div
      data-testid="group-colors"
      data-available={JSON.stringify(available)}
      data-selected={JSON.stringify(selected)}
      data-disable-tooltip={disableTooltip}
    />
  ),
}))

describe('GroupHeader', () => {
  const mockDate = new Date('2023-01-01')
  const mockAvailable = [
    { date: mockDate, time: 'ap' as const },
    { date: mockDate, time: 'ip' as const },
  ]
  const mockGroup = { date: mockDate, time: 'ap' as const }

  it('renders', async () => {
    const { container } = renderWithUserEvents(<GroupHeader available={mockAvailable} group={mockGroup} />)
    expect(container).toMatchSnapshot()
  })

  it('renders with the correct date and time', () => {
    renderWithUserEvents(<GroupHeader available={mockAvailable} group={mockGroup} />)

    expect(screen.getByText('dateFormat.wdshort date registration.timeLong.ap')).toBeInTheDocument()
  })

  it('passes the correct props to GroupColors', () => {
    renderWithUserEvents(<GroupHeader available={mockAvailable} group={mockGroup} />)

    const groupColors = screen.getByTestId('group-colors')
    expect(groupColors).toHaveAttribute('data-available', JSON.stringify(mockAvailable))
    expect(groupColors).toHaveAttribute('data-selected', JSON.stringify([mockGroup]))
    expect(groupColors).toHaveAttribute('data-disable-tooltip', 'true')
  })

  it('renders with the correct styling', () => {
    renderWithUserEvents(<GroupHeader available={mockAvailable} group={mockGroup} />)

    const header = screen.getByText('dateFormat.wdshort date registration.timeLong.ap').closest('.header')
    expect(header).toHaveStyle({
      height: '24px',
      lineHeight: '24px',
    })
  })

  it('renders with afternoon time', () => {
    const afternoonGroup = { date: mockDate, time: 'ip' as const }
    renderWithUserEvents(<GroupHeader available={mockAvailable} group={afternoonGroup} />)

    expect(screen.getByText('dateFormat.wdshort date registration.timeLong.ip')).toBeInTheDocument()
  })
})
